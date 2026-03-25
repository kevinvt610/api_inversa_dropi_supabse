const axios = require('axios');

const credentials = {
    email: "tatianasierra0326@gmail.com",
    password: "1023403191Isa.",
    white_brand_id: 10,
    brand: "",
    ipAddress: "190.27.10.13",
    otp: null,
    with_cdc: false
};

const browserHeaders = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'es-US,es-419;q=0.9,es;q=0.8',
    'content-type': 'application/json',
    'origin': 'https://app.seventyblock.com',
    'referer': 'https://app.seventyblock.com/',
    'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
};

async function getDropiOrders() {
    try {
        console.log("--- Iniciando Sesión ---");
        
        // 1. Solicitud de Login
        const loginResponse = await axios.post('https://api.dropi.co/api/login', credentials, {
            headers: browserHeaders
        });

        // Verificamos si el token existe en la respuesta
        if (loginResponse.data.token) {
            const token = loginResponse.data.token; // <--- AQUÍ CAPTURAMOS EL TOKEN
            console.log("✅ Token obtenido correctamente.");
            console.log(token); 

            console.log("--- Consultando Pedidos ---");

            // 2. Solicitud de Pedidos
            const ordersResponse = await axios.get('https://api.dropi.co/api/orders/myorders', {
                params: {
                    result_number: 5,
                    start: 1
                },
                headers: {
                    ...browserHeaders,
                    // Enviamos el token en el formato que pide el servidor
                    'Authorization': `Bearer ${token}` 
                }
            });

            console.log("✅ Respuesta de Pedidos recibida:");
            console.log(ordersResponse.data);

        } else {
            console.log("❌ No se encontró el token en la respuesta:", loginResponse.data);
        }

    } catch (error) {
        console.error("❌ Error en el proceso:");
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error("Mensaje del servidor:", error.response.data);
        } else {
            console.error("Error de red o configuración:", error.message);
        }
    }
}

getDropiOrders();