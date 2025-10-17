import streamlit as st
import boto3
from utils_kb import retrieve_and_generate_stream
from utils_kb_dyn_filter import get_metadata_filter

# Streamlit app title
st.title("🛍️ Your Virtual Assistant 🛎️")

# configuring values for session state
if "messages" not in st.session_state:
    st.session_state.messages = []

# Check if 'sessionId' for Bedrock KB exists in session_state; initialize if not
if "sessionId" not in st.session_state:
    st.session_state.sessionId = None

# writing the message that is stored in session state
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# Sidebar
st.sidebar.title("Model Configuration")
with st.sidebar:
    st.write("-----")

    # Allow user to select a region
    aws_regions = [
        "us-west-2",       # US West (Oregon) // Default on chatbot screen
        "us-east-2",       # US East (Ohio)
        "us-east-1",       # US East (N. Virginia)
        "us-west-1",       # US West (N. California)
        "af-south-1",      # Africa (Cape Town)
        "ap-east-1",       # Asia Pacific (Hong Kong)
        "ap-south-2",      # Asia Pacific (Hyderabad)
        "ap-southeast-3",  # Asia Pacific (Jakarta)
        "ap-southeast-4",  # Asia Pacific (Melbourne)
        "ap-south-1",      # Asia Pacific (Mumbai)
        "ap-northeast-3",  # Asia Pacific (Osaka)
        "ap-northeast-2",  # Asia Pacific (Seoul)
        "ap-southeast-1",  # Asia Pacific (Singapore)
        "ap-southeast-2",  # Asia Pacific (Sydney)
        "ap-northeast-1",  # Asia Pacific (Tokyo)
        "ca-central-1",    # Canada (Central)
        "eu-central-1",    # Europe (Frankfurt)
        "eu-west-1",       # Europe (Ireland)
        "eu-west-2",       # Europe (London)
        "eu-south-1",      # Europe (Milan)
        "eu-west-3",       # Europe (Paris)
        "eu-south-2",      # Europe (Spain)
        "eu-north-1",      # Europe (Stockholm)
        "eu-central-2",    # Europe (Zurich)
        "me-south-1",      # Middle East (Bahrain)
        "me-central-1",    # Middle East (UAE)
        "sa-east-1"        # South America (São Paulo)
    ]
    aws_region=st.selectbox('**AWS Region (*Confirm Bedrock support)**', aws_regions)

    # Create a Bedrock agent runtime client. Potentially to use a different for KB:
    bedrock_kb_client = boto3.client('bedrock-agent-runtime', region_name=aws_region)
    bedrock_client = boto3.client(service_name='bedrock', region_name=aws_region)
    
    # Knowledge Base ID. Change the default to your KB ID
    knowledge_base_id = st.text_input("Knowledge Base ID", "FUWDFBIUIA")
    
    # Model Selection
    models=[
        'anthropic.claude-3-5-sonnet-20241022-v2:0',
        'anthropic.claude-3-sonnet-20240229-v1:0',
        'anthropic.claude-3-5-sonnet-20240620-v1:0'
        ]
    model_id=st.selectbox('**Model**', models)

    # Allow user to enable/disable Dynamic Filtering:
    dynamic_filter_on = st.toggle("Enable Dynamic Filtering", value=True)

    # Temperature selection
    temperature = st.slider("**Temperature**", 0.1, 1.0, 0.5, step=0.1)
    
    # Top-K selection
    top_p = st.slider("**Top-P:**", 0.1, 1.0, 0.5, step=0.1)

    # System prompt as text input:
    st.markdown('### System Prompt:')
    system_prompt = st.text_area(
        "Change system prompt here (optional)",
        """You are a friendly chatbot, responsible of answering questions to customers, about the products we sell in our department store.
        Reply to the user in the same language as the question.
        Search for the products in your database, and provide the answer to the user.
        Try to be helpful, asking to the customers if they want more information about the products provided, or if they want to see the product reviews.
        Whenever possible, do upselling by offering products related to the user query.
        If the user query is not related to the products, you must answer that you don't have the information.
        Do not use any XML tags in the response.
        """
    )

# evaluating st.chat_input and determining if a question has been input
if question := st.chat_input("Message Claude"):

    # with the user icon, write the question to the front end
    with st.chat_message("user"):
        st.markdown(question)

    # append the question and the role (user) as a message to the session state
    st.session_state.messages.append({"role": "user",
                                      "content": question})

    # respond as the assistant with the answer
    with st.chat_message("assistant"):
        # making sure there are no messages present when generating the answer
        message_placeholder = st.empty()
        print(f"Question from user: {question}")

        if dynamic_filter_on and st.session_state.sessionId is None:
            # Call an LLM to generate the Metadata Filter
            metadata_filter = get_metadata_filter(question)
            print(f"Metadata Filter: {metadata_filter}")
        else:
            metadata_filter = None

        # Call the function to retrieve the stream and sessionId
        generator, session_id = retrieve_and_generate_stream(
            bedrock_client=bedrock_client,
            bedrock_kb_client=bedrock_kb_client,
            model_id=model_id,
            user_query=question,
            knowledge_base_id=knowledge_base_id,
            metadata_filter=metadata_filter,
            temperature=temperature,
            top_p=top_p,
            session_id=st.session_state.sessionId,  # Use the stored sessionId
        )
        
        # Stream the response
        full_response = ""
        for chunk in st.write_stream(generator):
            full_response += chunk

        # Update session state with the new sessionId
        st.session_state.sessionId = session_id

    # Append the final response to the session state messages
    st.session_state.messages.append({"role": "assistant", "content": full_response})
