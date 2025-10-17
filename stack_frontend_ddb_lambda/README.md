### Generating OpenAPI schemas

> Source: https://docs.powertools.aws.dev/lambda/python/latest/core/event_handler/bedrock_agents/#when-validation-fails

Use the get_openapi_json_schema function provided by the resolver to produce a JSON-serialized string that represents your OpenAPI schema. You can print this string or save it to a file. You'll use the file later when creating the Agent.

You'll need to regenerate the OpenAPI schema and update your Agent everytime your API changes.

```python
if __name__ == "__main__":  
    print(app.get_openapi_json_schema()) 
```

From your terminal:
```
cd stack_frontend_ddb_lambda/fn_upsert_order/
python3 lambda_function.py > ../stack_backend_bedrock/openapi/schema.json
```

You can now delete the added section above, with the app.get_openapi_json_schema() commands