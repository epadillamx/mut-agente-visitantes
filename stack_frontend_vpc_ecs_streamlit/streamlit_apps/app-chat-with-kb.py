import streamlit as st
import boto3
import os
from utils_kb import retrieve_products, stream_conversation

# Streamlit app title
st.title("🛍️ Your Virtual Assistant 🛎️")

# configuring values for session state
if "messages" not in st.session_state:
    st.session_state.messages = []

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
    aws_region=st.selectbox('**AWS Region (*Confirm Bedrock & Model support)**', aws_regions)

    # Create a Bedrock agent runtime client. Potentially to use a different for KB:
    bedrock_kb_client = boto3.client('bedrock-agent-runtime', region_name=aws_region)
    bedrock_client = boto3.client(service_name='bedrock-runtime', region_name=aws_region)

    # Knowledge Base ID. Change the default to your KB ID
    knowledge_base_id = st.text_input("Knowledge Base ID", "LTR5TC48DA")
    
    # Model Selection. Confirm available models in your region!
    models=['anthropic.claude-3-5-sonnet-20241022-v2:0',
            'anthropic.claude-instant-v1',
            'anthropic.claude-3-sonnet-20240229-v1:0',
            'anthropic.claude-3-haiku-20240307-v1:0',
            'anthropic.claude-3-5-sonnet-20240620-v1:0'
            ]
    model_id=st.selectbox('**Model**', models)

    # Temperature selection
    temperature = st.slider("**Temperature**", 0.1, 1.0, 0.5, step=0.1)
    
    # Top-K selection
    top_k = st.slider("**Top-K:**", 5, 250, 150, step=25)

    # Metadata filter
    metadata_filters = [
        None, "3-D Puzzles", "Accessories", "Action Man", "Activity Centres", "Alternative Medicine",
        "Art & Craft Supplies", "Art Sand", "BRIO", "Banners, Stickers & Confetti", "Barbie",
        "Baskets & Bins", "Beach Toys", "Bikes, Trikes & Ride-ons", "Blackboards", "Board Games",
        "Bob the Builder", "Boxes & Organisers", "Braces, Splints & Slings", "Brain Teasers", "Card Games",
        "Casino Equipment", "Charms", "Chess", "Children's Bedding", "Children's Chalk",
        "Children's Craft Kits", "Chocolate", "Climbing Frames", "Clothing & Accessories", "Collectible Figures & Memorabilia",
        "Colouring Pencils", "Colouring Pens & Markers", "Costumes", "Cowboys & Indians", "Crayola",
        "Cup & Ball Games", "DVD Games", "Darts & Accessories", "Decorations", "Decorative Accessories",
        "Desk Accessories & Storage Products", "Dice & Dice Games", "Digital Cameras", "Dinosaurs", "Disney",
        "Doll Making", "Dolls' House Dolls & Accessories", "Dominoes & Tile Games", "Drawing & Painting Supplies", "Drinking Games",
        "Early Learning Centre", "Educational Computers & Accessories", "Educational Games", "Emergency Services", "Erasers & Correction Supplies",
        "Erotic Clothing", "Farm & Animals", "Fashion Dolls & Accessories", "Felt Kits", "Finger Puppets",
        "Football", "Frame Jigsaws", "Garden Tools", "Greenhouses & Plant Germination Equipment", "Guitars & Strings",
        "Hand Puppets", "Hand Tools", "Harry Potter", "Hasbro", "Hornby",
        "Instruments", "Invitations", "Jigsaw Accessories", "Jigsaws", "Kid Venture",
        "Kids Remote & App Controlled Toys", "Kids'", "Kitchen Tools & Gadgets", "Kites & Flight Toys", "Knights & Castles",
        "Lab Instruments & Equipment", "Labels, Index Dividers & Stamps", "LeapFrog", "Learning & Activity Toys", "Literacy & Spelling",
        "Markers & Highlighters", "Marvin's Magic", "Mathematics", "Military", "Model Building Kits",
        "Model Trains & Railway Sets", "Mystery Games", "Novelty", "Pain & Fever", "Painting By Numbers",
        "Paper & Stickers", "Party Bags", "Party Favours", "Party Tableware", "Pencils",
        "Pens & Refills", "Pianos & Keyboards", "Pirates", "Play Tools", "Playsets",
        "Pushchair Toys", "Racket Games", "Rattles", "Ravensburger", "Remote Controlled Devices",
        "Robots", "Rockers & Ride-ons", "Rocking Horses", "Sandwich Spreads, Pates & Pastes", "Schoolbags & Backpacks",
        "Science Fiction & Fantasy", "Seasonal Décor", "Shops & Accessories", "Sleeping Gear", "Slot Cars, Race Tracks & Accessories",
        "Soft Dolls", "Sorting, Stacking & Plugging Toys", "Sound Toys", "Specialty & Decorative Lighting", "Spinning Tops",
        "Sport", "Star Wars", "Strategy Games", "Tabletop & Miniature Gaming", "Target Games",
        "Teaching Clocks", "Thomas & Friends", "Thunderbirds", "Tomy", "Tops & T-Shirts",
        "Toy Story", "Toy Trains & Accessories", "Toy Vehicle Playsets", "Toy Vehicles & Accessories", "Trading Cards & Accessories",
        "Transportation & Traffic", "Travel & Pocket Games", "Trivia & Quiz Games", "Upstarts", "VTech",
        "WWE", "Wind & Brass", "Winnie-the-Pooh", "others"
    ]
    metadata_filter=st.selectbox('**Product Category**', metadata_filters)

    # System prompt as text input:
    st.markdown('### System Prompt:')
    system_prompt = st.text_area(
        "Change system prompt here (optional)",
        """You are a friendly chatbot, responsible of answering questions to customers, about the products we sell in our department store.
        You must answer the user query, using the information from the products provided.
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

        # Metadata filter
        if metadata_filter:
            single_filter = {
                "equals": {
                    "key": "subcategory_1",
                    "value": metadata_filter
                }
            }
        else:
            single_filter = None

        # Get Products
        print("Fetching Products from Knowledge Base...")
        products, products_references = retrieve_products(question, knowledge_base_id, bedrock_kb_client, metadata_filter=single_filter)

        print("Generating final response...")
        response = st.write_stream(stream_conversation(
                                        bedrock_client=bedrock_client,
                                        model_id=model_id,
                                        system_prompt=system_prompt,
                                        user_query=question,
                                        products=products,
                                        temperature=temperature,
                                        top_k=top_k
                                        ))
        
        # Show referenced files from S3:
        if products_references:
            print(f"Files reviewed: {', '.join(os.path.basename(f) for f in products_references)}")
    
    # appending the final answer to the session state
    st.session_state.messages.append({"role": "assistant",
                                      "content": response})
