import json
import requests
from config_manager import get_config

def call_gpt(prompt, temperature=0.0):
    """Function to call the OpenAI API. Separated into a different module."""
    config = get_config()
    payload = {
        "messages": [
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
    }
    headers = {
        "api-key": config['api_key'],
        "Content-Type": "application/json"
    }
    try:
        response = requests.post(config["end_point"], headers=headers, json=payload)
        response.raise_for_status()  # Raise an exception for HTTP errors

        # Extract the message content and token usage from the response
        response_data = response.json()
        print(response_data)
        if "choices" in response_data and len(response_data["choices"]) > 0:
            message_content = response_data["choices"][0]["message"]["content"]
            input_tokens = response_data["usage"]["prompt_tokens"]
            output_tokens = response_data["usage"]["completion_tokens"]
            return {
                "message": message_content,
                "nToken": {
                    "input": input_tokens,
                    "output": output_tokens
                }
            }
        else:
            return {
                "message": "No valid response received from the API.",
                "nToken": {
                    "input": 0,
                    "output": 0
                }
            }

    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")
        return {
            "message": "Request failed.",
            "nToken": {
                "input": 0,
                "output": 0
            }
        }