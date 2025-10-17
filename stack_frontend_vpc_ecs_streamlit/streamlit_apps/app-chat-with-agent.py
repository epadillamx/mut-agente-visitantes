"""
@ Streamlit app credits: 
    github.com/aws-samples/amazon-bedrock-samples/blob/function_calling/agents/customer-relationship-management-agent/app.py
"""
import streamlit as st
from utils_agent import BedrockAgent


def main():
    """
    @ Docs to be added
    """
    st.title("🛍️ Your Virtual Assistant 🛎️")
    col1, col2, col3 = st.columns((6, 2, 2))

    # Use the specific column
    with col1:
        st.subheader(":grey[Amazon Bedrock Agents]")

    # Change the IDs for your own:
    agent_id = st.text_input("Agent ID","MFYSICLHUS")
    agent_alias_id = st.text_input("Agent Alias ID", "W1OQTZSJQN")

    if st.button("Initialize Agent"):
        if agent_id and agent_alias_id:
            st.session_state.bedrock = BedrockAgent(agent_id, agent_alias_id)
            st.success("Agent initialized successfully!")
        else:
            st.warning("Please provide both Agent ID and Agent Alias ID.")


    st.markdown(
        """
        <style>
            .stButton button {
                background-color: white;
                width: 82px;
                border: 0px;
                padding: 0px;
            }
            .stButton button:hover {
                background-color: white;
                color: black;
            }

        </style>
        """,
        unsafe_allow_html=True,
    )

    if "chat_history" not in st.session_state or len(st.session_state["chat_history"]) == 0:
        st.session_state["chat_history"] = [
            {
                "role": "assistant",
                "prompt": "Hi! I am your virtual shopping assistant. How can I help you?",
            }
        ]

    for index, chat in enumerate(st.session_state["chat_history"]):
        with st.chat_message(chat["role"]):
            if index == 0:
                col1, space, col2 = st.columns((7, 1, 2))
                col1.markdown(chat["prompt"])

                if col2.button("Clear", type="secondary"):
                    st.session_state["chat_history"] = []
                    if "bedrock" in st.session_state:
                        st.session_state.bedrock.new_session()
                    st.rerun()

            elif chat["role"] == "assistant":
                col1, col2 = st.columns((9, 1))
                col1.markdown(chat["prompt"], unsafe_allow_html=True)
            else:
                st.markdown(chat["prompt"])

    if prompt := st.chat_input("What do you want to shop today?..."):
        st.session_state["chat_history"].append({"role": "human", "prompt": prompt})

        with st.chat_message("human"):
            st.markdown(prompt)

        with st.chat_message("assistant"):
            if "bedrock" in st.session_state:
                response_text = st.session_state.bedrock.invoke_agent(prompt)
                st.session_state["chat_history"].append(
                    {"role": "assistant", "prompt": response_text}
                )

                st.write(response_text)
            else:
                st.write("Please initialize the agent by providing the Agent ID and Agent Alias ID, and clicking the 'Initialize Agent' button.")


if __name__ == "__main__":
    main()
