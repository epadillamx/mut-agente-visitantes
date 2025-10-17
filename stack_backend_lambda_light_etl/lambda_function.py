import re
import os
import json
import boto3
import awswrangler as wr
import pandas as pd
import concurrent.futures
from math import ceil
from io import StringIO


def lambda_handler(event, context):
    try:
        # S3 bucket configuration
        s3_bucket = "raw-virtual-assistant-data-948270077717-us-east-1"
        
        # Define CSV files to process with their encodings
        csv_files = {
            'eventos': {'filename': 'eventos.csv', 'encoding': 'utf-8'},
            'preguntas': {'filename': 'preguntas.csv', 'encoding': 'cp1252'},
            'stores': {'filename': 'stores.csv', 'encoding': 'utf-8'},
            'restaurantes': {'filename': 'todas_restaurantes.csv', 'encoding': 'utf-8'}
        }
        
        # Output configuration
        num_rows_per_file = 50  # Adjust based on your needs
        local_number_of_threads = 10
        
        # Knowledge Base output path from environment
        output_s3_key = os.environ.get('KB_S3_PATH', 'datasets/demo_kb/knowledge-base-ecommerce-s3-001/v1')
        
        results = {}
        
        # Process each CSV file
        for file_type, file_config in csv_files.items():
            filename = file_config['filename']
            encoding = file_config['encoding']
            s3_path = f"s3://{s3_bucket}/{filename}"
            
            print(f"Processing {file_type} from {s3_path} with encoding {encoding}")
            
            try:
                # Read CSV with robust parsing options
                df = read_csv_robust(s3_path, encoding)
                
                if df is None or len(df) == 0:
                    print(f"Warning: {file_type} is empty or could not be read. Skipping...")
                    results[file_type] = 0
                    continue
                
                print(f"Successfully read {len(df)} rows from {file_type}")
                
                # Apply specific transformations based on file type
                df = transform_dataframe(df, file_type)
                
                print(f"Writing {len(df)} rows for {file_type} to Amazon S3...")
                
                # Write to S3 with metadata
                rows_written = write_data_to_s3(
                    df=df,
                    file_type=file_type,
                    s3_bucket=s3_bucket,
                    output_s3_key=output_s3_key,
                    num_rows_per_file=num_rows_per_file,
                    max_workers=local_number_of_threads
                )
                
                results[file_type] = rows_written
                
            except Exception as e:
                print(f"Error processing {file_type}: {str(e)}")
                results[file_type] = f"Error: {str(e)}"
                continue
        
        return {
            "statusCode": 200,
            "body": {
                "message": f"Data successfully written to: {output_s3_key}",
                "results": results
            }
        }
        
    except Exception as e:
        print(f"Error processing files: {str(e)}")
        raise


def read_csv_robust(s3_path, encoding):
    """
    Read CSV with multiple fallback strategies for problematic files.
    """
    # Strategy 1: Try with awswrangler with robust settings
    try:
        df = wr.s3.read_csv(
            path=s3_path,
            header=0,
            sep=',',
            quotechar='"',
            encoding=encoding,
            escapechar='\\',
            on_bad_lines='skip',  # Skip bad lines instead of failing
            engine='python'  # Python engine is more forgiving
        )
        return df
    except Exception as e1:
        print(f"Strategy 1 failed: {str(e1)}")
        
        # Strategy 2: Try with different delimiter detection
        try:
            s3_client = boto3.client('s3')
            bucket, key = s3_path.replace('s3://', '').split('/', 1)
            
            # Download file content
            obj = s3_client.get_object(Bucket=bucket, Key=key)
            content = obj['Body'].read().decode(encoding)
            
            # Try pandas with robust settings
            df = pd.read_csv(
                StringIO(content),
                sep=',',
                quotechar='"',
                encoding=encoding,
                escapechar='\\',
                on_bad_lines='skip',
                engine='python',
                dtype=str  # Read everything as string initially
            )
            return df
        except Exception as e2:
            print(f"Strategy 2 failed: {str(e2)}")
            
            # Strategy 3: Try with latin1 encoding
            try:
                obj = s3_client.get_object(Bucket=bucket, Key=key)
                content = obj['Body'].read().decode('latin1')
                
                df = pd.read_csv(
                    StringIO(content),
                    sep=',',
                    quotechar='"',
                    on_bad_lines='skip',
                    engine='python',
                    dtype=str
                )
                return df
            except Exception as e3:
                print(f"Strategy 3 failed: {str(e3)}")
                
                # Strategy 4: Last resort - try semicolon delimiter
                try:
                    obj = s3_client.get_object(Bucket=bucket, Key=key)
                    content = obj['Body'].read().decode(encoding, errors='ignore')
                    
                    df = pd.read_csv(
                        StringIO(content),
                        sep=';',
                        quotechar='"',
                        on_bad_lines='skip',
                        engine='python',
                        dtype=str
                    )
                    return df
                except Exception as e4:
                    print(f"All strategies failed. Last error: {str(e4)}")
                    return None


def transform_dataframe(df, file_type):
    """Apply specific transformations based on file type."""
    
    if file_type == 'eventos':
        # Convert fecha_publicacion to datetime if needed
        if 'fecha_publicacion' in df.columns:
            df['fecha_publicacion'] = df['fecha_publicacion'].astype(str)
        
        # Ensure texto fields are limited in length for embeddings
        if 'contenido' in df.columns:
            df['contenido'] = df['contenido'].astype(str).str.slice(0, 500)
        if 'descripcion' in df.columns:
            df['descripcion'] = df['descripcion'].astype(str).str.slice(0, 500)
        
        # Add type identifier
        df['entity_type'] = 'evento'
        
    elif file_type == 'preguntas':
        # Add type identifier
        df['entity_type'] = 'pregunta'
        
        # Limit text fields if they exist
        for col in df.columns:
            if df[col].dtype == 'object':
                df[col] = df[col].astype(str).str.slice(0, 1000)
        
    elif file_type == 'stores':
        # Clean phone numbers if needed
        if 'telefono' in df.columns:
            df['telefono'] = df['telefono'].astype(str)
        
        # Limit content length
        if 'content' in df.columns:
            df['content'] = df['content'].astype(str).str.slice(0, 500)
        
        # Add type identifier
        df['entity_type'] = 'tienda'
        
    elif file_type == 'restaurantes':
        # Clean phone numbers
        if 'telefono' in df.columns:
            df['telefono'] = df['telefono'].astype(str)
        
        # Limit content length
        if 'content' in df.columns:
            df['content'] = df['content'].astype(str).str.slice(0, 500)
        
        # Add type identifier
        df['entity_type'] = 'restaurante'
    
    # Fill NaN values with empty strings
    df = df.fillna('')
    
    # Remove any completely empty rows
    df = df.dropna(how='all')
    
    return df


def write_data_to_s3(df, file_type, s3_bucket, output_s3_key, num_rows_per_file, max_workers):
    """Write dataframe to S3 in chunks with metadata."""
    
    s3_client = boto3.client('s3')
    
    # Determine grouping strategy based on file type
    if file_type == 'eventos':
        # Group by tipo (if exists) or write as single type
        group_column = 'tipo' if 'tipo' in df.columns else None
    elif file_type in ['stores', 'restaurantes']:
        # Group by tipo or nivel
        group_column = 'tipo' if 'tipo' in df.columns else 'nivel' if 'nivel' in df.columns else None
    else:
        group_column = None
    
    total_rows = 0
    
    if group_column and group_column in df.columns:
        # Process by groups
        unique_values = df[group_column].unique()
        for group_value in unique_values:
            if not group_value or group_value == '' or str(group_value) == 'nan':
                group_value = 'otros'
            
            subset = df[df[group_column] == group_value]
            rows = write_chunks_to_s3(
                df=subset,
                file_type=file_type,
                group_name=str(group_value),
                s3_bucket=s3_bucket,
                s3_key=output_s3_key,
                num_rows_per_file=num_rows_per_file,
                s3_client=s3_client
            )
            total_rows += rows
    else:
        # Write all data with single group
        rows = write_chunks_to_s3(
            df=df,
            file_type=file_type,
            group_name='all',
            s3_bucket=s3_bucket,
            s3_key=output_s3_key,
            num_rows_per_file=num_rows_per_file,
            s3_client=s3_client
        )
        total_rows += rows
    
    return total_rows


def write_chunks_to_s3(df, file_type, group_name, s3_bucket, s3_key, num_rows_per_file, s3_client):
    """Write DataFrame chunks to S3 with metadata files."""
    
    num_rows = len(df)
    num_files = ceil(num_rows / num_rows_per_file)
    
    # Clean group name for filename
    clean_group = re.sub(r"[,\s&'/\\]", "_", str(group_name))
    
    for i in range(num_files):
        start_row = i * num_rows_per_file
        end_row = min((i + 1) * num_rows_per_file, num_rows)
        
        # Create filename
        file_name = f"{file_type}_{clean_group}_part_{i+1}.csv"
        full_path = f"s3://{s3_bucket}/{s3_key}/{file_name}"
        
        # Write CSV chunk
        df_chunk = df.iloc[start_row:end_row]
        wr.s3.to_csv(df_chunk, full_path, index=False)
        
        # Create and write metadata
        metadata = {
            "metadataAttributes": {
                "file_type": file_type,
                "group": group_name,
                "part_number": i + 1,
                "total_parts": num_files,
                "row_count": len(df_chunk),
                "entity_type": df_chunk['entity_type'].iloc[0] if 'entity_type' in df_chunk.columns else file_type
            }
        }
        
        # Write metadata JSON
        metadata_key = f"{s3_key}/{file_name}.metadata.json"
        s3_client.put_object(
            Bucket=s3_bucket,
            Key=metadata_key,
            Body=json.dumps(metadata, ensure_ascii=False),
            ContentType='application/json'
        )
        
        print(f"Written: {file_name} ({len(df_chunk)} rows)")
    
    return num_rows