"""
@ Streamlit app credits: 
    github.com/aws-samples/amazon-bedrock-samples/blob/function_calling/agents/customer-relationship-management-agent/app.py

@ Important:
    The auth mechanism is not secure. It's only for demo Purposes. It's not using Cognito, WAF, SSO, or anything similar.
    From ST support: "values your app stores in session_state are NOT sent to the browser or otherwise available client-side in any way…"
    Source: https://discuss.streamlit.io/t/hey-i-have-a-serious-issue-about-storing-things-in-the-session-state/35761
"""
import streamlit as st
import boto3
import json
from botocore.exceptions import ClientError
from utils_agent import BedrockAgent

# Initialize AWS session
session = boto3.session.Session()

def get_secret(secret_name = "dev/ecomm/appServerDev01Credentials", region_name = "us-west-2"):
    """
    Note: Hardcoding Secret and Region, just for Demo purposes
    """
    
    # Create a Secrets Manager client
    client = session.client(
        service_name='secretsmanager',
        region_name=region_name
    )

    try:
        get_secret_value_response = client.get_secret_value(
            SecretId=secret_name
        )
    except ClientError as e:
        # Handle any AWS errors here
        st.error(f"Error retrieving secret: {e}")
        return None
    else:
        # Decrypt secret using the associated KMS key
        secret = get_secret_value_response['SecretString']
        return json.loads(secret)


def check_password():
    """Returns `True` if the user had the correct password."""

    def login_form():
        """Form with widgets to collect user information"""
        with st.form("Credentials"):
            st.text_input("Username", key="username")
            st.text_input("Password", type="password", key="password")
            return st.form_submit_button("Log in")

    if "authenticated" not in st.session_state:
        st.session_state.authenticated = False

    if not st.session_state.authenticated:
        st.title("Please log in")
        if login_form():
            creds = get_secret()
            if creds:
                if (st.session_state.username == creds['username'] 
                    and st.session_state.password == creds['password']):
                    st.session_state.authenticated = True
                    st.rerun()
                else:
                    st.error("Invalid credentials")
            else:
                st.error("Failed to retrieve credentials")
        return False

    return True


def main():
    if not check_password():
        return
    st.title("🛍️ Your Virtual Assistant 🛎️")
    col1, col2, col3 = st.columns((6, 2, 2))

    # Use the specific column
    with col1:
        st.subheader(":grey[Amazon Bedrock Agents]")

    # Change the IDs for your own:
    agent_id = st.text_input("Agent ID","XXXXXXXX")
    agent_alias_id = st.text_input("Agent Alias ID", "YYYYYYYY")

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
