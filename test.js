require('dotenv').config();
const axios = require('axios');

const PROJECT_URL = process.env.PROJECT_URL || "https://jhwgtihnpceyvuaqlkgb.supabase.co/functions/v1";

const credentials = {
    email: process.env.DROPI_EMAIL,
    password: process.env.DROPI_PASSWORD,
    white_brand_id: 10,
    brand: "",
    ipAddress: "190.27.10.13",
    otp: null,
    with_cdc: false
};

async function testSupabaseFunctions() {
    try {
        console.log("=========================================");
        console.log("➡️ PROBANDO ENDPOINT: dropi-login");
        console.log("=========================================");
        
        const loginResponse = await axios.post(`${PROJECT_URL}/dropi-login`, credentials, {
            headers: { 'Content-Type': 'application/json' }
        });

        if (loginResponse.data && loginResponse.data.token) {
            const token = loginResponse.data.token;
            console.log("✅ [LOGIN OK] Status:", loginResponse.status);
            console.log("✅ Token capturado exitosamente:", token.substring(0, 30) + "...\n");

            console.log("=========================================");
            console.log("➡️ PROBANDO ENDPOINT: dropi-orders (SIN MANDAR EL TOKEN)");
            console.log("=========================================");

            const ordersResponse = await axios.get(`${PROJECT_URL}/dropi-orders`, {
                params: {
                    result_number: 10,
                    start: 1
                }
                // ¡Ya no enviamos el header Authorization aquí! 
                // La Edge Function lo buscará solita en la base de datos `dropi_tokens`.
            });

            console.log("✅ [ORDERS OK] Status:", ordersResponse.status);
            const responseData = ordersResponse.data;
            
            let orderCount = 0;
            let firstOrder = null;

            // La respuesta de Dropi puede venir en `objects` o en `data`
            const orderList = responseData.objects || responseData.data || responseData;

            if (Array.isArray(orderList)) {
                // Si es un arreglo ("objects" es un arreglo en tu cuenta)
                orderCount = orderList.length;
                firstOrder = orderList[0];
            } else if (typeof orderList === 'object' && orderList !== null) {
                // Si es un objeto indexado por IDs
                const orderKeys = Object.keys(orderList);
                orderCount = orderKeys.length;
                if (orderCount > 0) {
                    firstOrder = orderList[orderKeys[0]];
                }
            }

            console.log(`📦 Se obtuvieron ${orderCount} órdenes.`);
            
            if (firstOrder) {
                console.log("\n🔍 Ejemplo de la primera orden (resumido):");
                console.log(JSON.stringify(firstOrder, null, 2).substring(0, 400) + "\n... (cortado para no saturar la consola)");
            }

            console.log("\n=========================================");
            console.log("➡️ PROBANDO ENDPOINT: dropi-departments (Solo Departamentos)");
            console.log("=========================================");

            const deptResponse = await axios.get(`${PROJECT_URL}/dropi-departments`);
            
            console.log("✅ [DEPARTMENTS OK] Status:", deptResponse.status);
            const deptData = deptResponse.data;
            let deptCount = deptData.count || 0;
            let firstDept = null;
            
            const deptList = deptData.objects || deptData.data || deptData;
            if (Array.isArray(deptList)) {
                deptCount = deptList.length;
                firstDept = deptList[0];
            }

            console.log(`🗺️ Se obtuvieron ${deptCount} departamentos.`);
            if (firstDept) {
                console.log("\n🔍 Ejemplo del primer departamento (Nota que NO trae el arreglo de ciudades por defecto):");
                console.log(JSON.stringify(firstDept, null, 2));
            }

            console.log("\n=========================================");
            console.log(`➡️ PROBANDO FILTRO: Ciudades del Depto ${firstDept ? firstDept.id : 13}`);
            console.log("=========================================");

            const citiesResponse = await axios.get(`${PROJECT_URL}/dropi-departments?department_id=${firstDept ? firstDept.id : 13}`);
            console.log("✅ [CITIES OK] Status:", citiesResponse.status);
            const citiesData = citiesResponse.data;
            let cityCount = citiesData.count || 0;
            let firstCity = null;
            
            const cityList = citiesData.objects || citiesData.data || citiesData;
            if (Array.isArray(cityList)) {
                cityCount = cityList.length;
                firstCity = cityList[0];
            }

            console.log(`🏙️ Se obtuvieron ${cityCount} ciudades para este departamento.`);
            if (firstCity) {
                console.log("\n🔍 Ejemplo de la primera ciudad obtenida con el filtro:");
                console.log(JSON.stringify(firstCity, null, 2));
            }

            console.log("\n=========================================");
            console.log("➡️ PROBANDO ENDPOINT: dropi-create-order (Fallo intencional)");
            console.log("=========================================");

            const fakeOrderPayload = {
                "calculate_costs_and_shiping": true,
                "state": "CUNDINAMARCA",
                "city": "BOGOTA",
                "client_email": "correo_test@gmail.com",
                "name": "kevin",
                "surname": "tovar",
                "dir": "direccion_test 123",
                "notes": "esta orden es de prueba",
                "payment_method_id": 1,
                "phone": "313523645",
                "rate_type": "CON RECAUDO",
                "type": "FINAL_ORDER",
                "total_order": 280000,
                "products": [
                    {
                    "id": 1297563,
                    "price": 280000,
                    "variation_id": null,
                    "quantity": 1
                    }
                ]
            };

            try {
                const orderResponse = await axios.post(`${PROJECT_URL}/dropi-create-order`, fakeOrderPayload, {
                    headers: { 'Content-Type': 'application/json' }
                });
                console.log("✅ [CREATE ORDER OK] Status:", orderResponse.status);
                console.log("Respuesta:", JSON.stringify(orderResponse.data, null, 2));
            } catch (orderError) {
                console.log("❌ [CREATE ORDER FALLÓ ESPERADAMENTE] Status:", orderError.response?.status);
                console.log("Mensaje de error (Dropi):", JSON.stringify(orderError.response?.data, null, 2));
            }

        } else {
            console.log("❌ Falló el Login. Respuesta:", loginResponse.data);
        }

    } catch (error) {
        console.error("\n❌ Ocurrió un Error durante la prueba:");
        if (error.response) {
            console.error(`Status devuelto por Supabase: ${error.response.status}`);
            console.error("Detalle del error:", error.response.data);
        } else {
            console.error("Error desconocido:", error.message);
        }
    }
}

testSupabaseFunctions();
