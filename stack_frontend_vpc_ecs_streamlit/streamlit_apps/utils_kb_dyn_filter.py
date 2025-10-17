import json
import boto3

# Session init
session = boto3.session.Session()
region = session.region_name

# SDK init
bedrock_runtime = boto3.client('bedrock-runtime')
bedrock_agent_runtime = boto3.client("bedrock-agent-runtime")


def system_prompt():
    return """You are an expert in extracting the main product category, for products that users are looking for.
    Do not return any other text, except for the product category you have extracted.
    """


def generate_prompt(question, product_categories):
    return f"""
    Below, you have a product category list below in XML tags, containing the product categories we have in our store.
    Your task is to return the category that is the most representative for the user question's context or semantic.
    Return only one category and return it as it is, without any changes to it. The list is below:
    
    <product_categories>
    {product_categories}. 
    </product_categories>

    IMPORTANT: Return the category as it is on the list, without adding or modifying anything. 
    For example, if the user question is "I'm looking DIY sand for my son", then you'll need to return "Art Sand".
    If you cannot map or find the category value, return 'others'. 
    If the question is not related to an ecommerce store, use 'unknown'.

    Respond to the following user question:
    {question}
    """


def get_category(question, product_categories, model_id):
    """
    Retrieves the product category from the given text using the specified tool properties.

    Args:
        text (str): The input text to be processed.
        
    Returns:
        str: The product category if found.
    """ 
    try:  
         
      print("Calling LLM to get the product category, to be used as the Metadata Filter...")

      response = bedrock_runtime.converse(
        modelId=model_id,
        system=[{
          "text": system_prompt()
        }],
        messages=[{
          "role": "user",
          "content": [{"text": generate_prompt(question,product_categories)}]
        }],
        inferenceConfig={
            "maxTokens": 4096,
            "temperature": 0.5
        },
      )

      # Return only category
      category_product = response['output']['message']['content'][0]['text']

      return category_product
  
    except Exception as e:
      print(f"Error while mapping user query with product category: {e}")
      return None
    

def construct_metadata_filter(product_category):
    """_summary_

    Args:
        product_category (_type_): _description_

    Returns:
        _type_: _description_
    """

    print(f"Building metadata filter for category: {product_category}") 
    
    if product_category and product_category != 'unknown':
        metadata_filter = {
            "equals": {
                "key": "subcategory_1",
                "value": product_category
                }
        } 
    else:
        print("Product category is unknown. Skipping metadata filter.")
        metadata_filter = None

    return metadata_filter


def get_metadata_filter(user_question, model_id="anthropic.claude-3-5-haiku-20241022-v1:0"):
    """_summary_

    Args:
        user_question (_type_): _description_
        model_id (str, optional): _description_. Defaults to "anthropic.claude-3-5-haiku-20241022-v1:0".

    Returns:
        _type_: _description_
    """

    # Estas categorías pueden reemplazarse por una lista traída de S3 que se refresque a diario, a partir de una BBDD.
    subcategory_filters = [
            "3-D Puzzles", "Accessories", "Action Man", "Activity Centres", "Alternative Medicine",
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

    # Get all categories from Database; i.e. refresh once a day from DB.
    db_product_categories = ",".join(str(x) for x in subcategory_filters)

    # Build metadata filter dict, calling an LLM
    extracted_entities = get_category(question=user_question,
                                      product_categories=db_product_categories,
                                      model_id=model_id)
    
    # Build dict as Bedrock API needs
    metadata_filter = construct_metadata_filter(extracted_entities)

    return metadata_filter
