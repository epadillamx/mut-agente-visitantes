/**
 * Lambda function that receives a value and responds with "Hola Mundo"
 * @param {Object} event - API Gateway event object
 * @returns {Object} Response object with statusCode and body
 */
exports.handler = async (event) => {
    console.log('Event received:', JSON.stringify(event, null, 2));

    // Parse the request body if it exists
    let requestBody = {};
    if (event.body) {
        try {
            requestBody = JSON.parse(event.body);
        } catch (error) {
            console.error('Error parsing body:', error);
        }
    }

    // Extract the value from the request (if provided)
    const inputValue = requestBody.value || event.value || 'sin valor';

    // Prepare response
    const response = {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({
            message: 'Hola Mundo',
            receivedValue: inputValue,
            timestamp: new Date().toISOString()
        })
    };

    console.log('Response:', JSON.stringify(response, null, 2));

    return response;
};
