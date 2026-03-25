require('dotenv').config();
const axios = require('axios');
const readline = require('readline');

const PROJECT_URL = process.env.PROJECT_URL || "https://jhwgtihnpceyvuaqlkgb.supabase.co/functions/v1";

// Datos Centrales
const credentials = {
    email: process.env.DROPI_EMAIL,
    password: process.env.DROPI_PASSWORD,
    white_brand_id: 10,
    brand: "",
    ipAddress: "190.27.10.13",
    otp: null,
    with_cdc: false
};

// Interfaz de consola
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

let globalOrderList = []; // Memoria cache para usar el ID al descargar PDF

// ==========================================
// 1. ENDPOINT DE AUTENTICACION
// ==========================================
async function login() {
    console.log("\n=========================================");
    console.log("🔐 EJECUTANDO LOGIN OBLIGATORIO");
    console.log("=========================================");
    try {
        const loginResponse = await axios.post(`${PROJECT_URL}/dropi-login`, credentials, {
            headers: { 'Content-Type': 'application/json' }
        });
        if (loginResponse.data && loginResponse.data.token) {
            console.log("✅ [LOGIN OK] Status:", loginResponse.status);
            console.log("✅ Token guardado mágicamente en Supabase.\n");
            return true;
        } else {
            console.log("❌ Falló el Login. Respuesta:", loginResponse.data);
            return false;
        }
    } catch (error) {
        console.error("\n❌ Error en Login:", error.response ? error.response.data : error.message);
        return false;
    }
}

// ==========================================
// 2. ENDPOINT DE ORDENES (GET)
// ==========================================
async function testOrders() {
    console.log("\n=========================================");
    console.log("📦 PROBANDO ENDPOINT: dropi-orders");
    console.log("=========================================");
    try {
        const ordersResponse = await axios.get(`${PROJECT_URL}/dropi-orders`, {
            params: { result_number: 10, start: 1 } // Trae las últimas 10
        });
        console.log("✅ [ORDERS OK] Status:", ordersResponse.status);
        const responseData = ordersResponse.data;
        
        let orderCount = 0;
        let firstOrder = null;
        
        const orderList = responseData.objects || responseData.data || responseData;
        if (Array.isArray(orderList)) {
            globalOrderList = orderList; // Guardamos en RAM del script para el PDF
            orderCount = orderList.length;
            firstOrder = orderList[0];
        } else if (typeof orderList === 'object' && orderList !== null) {
            const orderKeys = Object.keys(orderList);
            orderCount = orderKeys.length;
            if (orderCount > 0) {
                firstOrder = orderList[orderKeys[0]];
                globalOrderList = [firstOrder]; 
            }
        }
        
        console.log(`📦 Se obtuvieron ${orderCount} órdenes.`);
        if (firstOrder) {
            console.log("\n🔍 Ejemplo de la primera orden (Resumido):");
            // Lo resumimos para no romper la terminal entera
            console.log(JSON.stringify(firstOrder, null, 2).substring(0, 400) + "\n... (cortado)");
        }
    } catch (error) {
        console.error("❌ Error en Orders:", error.response ? error.response.data : error.message);
    }
}

// ==========================================
// 3. ENDPOINT GEOGRAFICO (DEPARTAMENTOS)
// ==========================================
async function testDepartments() {
    console.log("\n=========================================");
    console.log("🗺️ PROBANDO ENDPOINT: dropi-departments");
    console.log("=========================================");
    try {
        const deptResponse = await axios.get(`${PROJECT_URL}/dropi-departments`);
        console.log("✅ [DEPARTMENTS OK] Status:", deptResponse.status);
        const deptData = deptResponse.data;
        
        let deptCount = 0;
        let firstDept = null;
        const deptList = deptData.objects || deptData.data || deptData;
        if (Array.isArray(deptList)) {
            deptCount = deptList.length;
            firstDept = deptList[0];
        }
        console.log(`🗺️ Se obtuvieron ${deptCount} departamentos.`);
        
        if (firstDept) {
            console.log(`\n➡️ PROBANDO FILTRO: Solicitando solo las Ciudades de: ${firstDept.name}`);
            const citiesResponse = await axios.get(`${PROJECT_URL}/dropi-departments?department_id=${firstDept.id}`);
            console.log("✅ [CITIES OK] Status:", citiesResponse.status);
            const citiesData = citiesResponse.data;
            const cityList = citiesData.objects || citiesData.data || citiesData;
            console.log(`🏙️ Se obtuvieron ${Array.isArray(cityList) ? cityList.length : 0} ciudades para ese departamento.`);
            if (Array.isArray(cityList) && cityList.length > 0) {
                console.log("🔍 Ejemplo primera ciudad:", JSON.stringify(cityList[0], null, 2));
            }
        }
    } catch (error) {
        console.error("❌ Error en Departments:", error.response ? error.response.data : error.message);
    }
}

// ==========================================
// 4. ENDPOINT CREAR ORDEN (POST)
// ==========================================
async function testCreateOrder() {
    console.log("\n=========================================");
    console.log("🛒 PROBANDO ENDPOINT: dropi-create-order");
    console.log("=========================================");
    
    // Payload enviado por Kevin
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
            { "id": 1297563, "price": 280000, "variation_id": null, "quantity": 1 }
        ]
    };

    try {
        const orderResponse = await axios.post(`${PROJECT_URL}/dropi-create-order`, fakeOrderPayload, {
            headers: { 'Content-Type': 'application/json' }
        });
        console.log("✅ [CREATE ORDER OK] Status:", orderResponse.status);
        console.log("Respuesta Exitosa:", JSON.stringify(orderResponse.data, null, 2));
    } catch (orderError) {
        console.log("❌ [CREATE ORDER FALLO] Status:", orderError.response?.status);
        console.log("Mensaje de Error Dropi:", JSON.stringify(orderError.response?.data, null, 2));
    }
}

// ==========================================
// 5. ENDPOINT DESCARGA DE PDF
// ==========================================
async function testDownloadPdf() {
    console.log("\n=========================================");
    console.log("🖨️ PROBANDO ENDPOINT: Descarga Segura de PDF");
    console.log("=========================================");
    
    if (globalOrderList.length === 0) {
        console.log("⚠️ Primero debes ejecutar la opción 1 (Consultar Órdenes) para almacenar las órdenes en memoria y extraer sus stickers.");
        return;
    }
    
    // Busca la primera orden que contenga guia generada y tenga la URL3
    let orderToDownload = globalOrderList.find(o => o.status === "GUIA_GENERADA" && o.guia_urls3);
    
    if (orderToDownload) {
        console.log(`✅ Orden encontrada con guía: ${orderToDownload.id}`);
        const partesUrl = orderToDownload.guia_urls3.split("/");
        const sticker = partesUrl[partesUrl.length - 1]; // ORDEN-...pdf
        let transportadora = orderToDownload.distribution_company?.name?.toLowerCase() || partesUrl[partesUrl.length - 2];
        
        // Reglas de negocio Dropi
        if (transportadora.includes('envia') || transportadora.includes('servientrega')) transportadora = 'servientrega';
        else if (transportadora.includes('interrapidisimo')) transportadora = 'interrapidisimo';
        else if (transportadora.includes('domina')) transportadora = 'domina';
        else if (transportadora.includes('coordinadora')) transportadora = 'coordinadora';

        console.log(`🚚 Transportadora Normalizada: ${transportadora} | 📄 Sticker: ${sticker}`);
        try {
            console.log(`📥 Descargando PDF desde Supabase Proxy...`);
            const pdfResponse = await axios.get(`${PROJECT_URL}/dropi-download-pdf?transportadora=${transportadora}&sticker=${sticker}`, {
                responseType: 'arraybuffer' // Necesario para descargar archivos
            });
            if (pdfResponse.status === 200) {
                const fs = require('fs');
                const fileName = `guia_${orderToDownload.id}.pdf`;
                fs.writeFileSync(fileName, pdfResponse.data);
                console.log(`✅ [PDF DESCARGADO] El archivo se guardó localmente como: ${fileName}`);
            }
        } catch(err) {
            console.log("❌ Error descargando PDF:", err.message);
        }
    } else {
        console.log("⚠️ No se encontró ninguna orden en el listado con estado GUIA_GENERADA.");
    }
}

// ==========================================
// CICLO PRINCIPAL (MENU)
// ==========================================
async function showMenu() {
    let exit = false;
    while (!exit) {
        console.log("\n=========================================");
        console.log("    🚀 MENÚ INTERACTIVO API DROPI");
        console.log("=========================================");
        console.log("1. Consultar Órdenes (dropi-orders)");
        console.log("2. Consultar Filtros Geográficos (dropi-departments)");
        console.log("3. Crear Orden de Ejemplo (dropi-create-order)");
        console.log("4. Descargar PDF de Guía (dropi-download-pdf)");
        console.log("0. Salir de la Prueba");
        console.log("=========================================");
        
        const answer = await askQuestion("Elige una opción (0-4): ");
        
        switch (answer.trim()) {
            case '1': await testOrders(); break;
            case '2': await testDepartments(); break;
            case '3': await testCreateOrder(); break;
            case '4': await testDownloadPdf(); break;
            case '0': 
                console.log("👋 Saliendo del programa...");
                exit = true; 
                break;
            default: console.log("⚠️ Opción no válida.");
        }
    }
    rl.close();
}

async function main() {
    console.log("🚀 Iniciando Interfaz de Pruebas de Dropi Proxy");
    const isLogged = await login();
    
    // Solo mostramos el menú si el login en el sistema fallbacks pasa bien
    if (isLogged) {
        await showMenu();
    } else {
        console.log("❌ Saliendo del programa debido a fallo en la autorización.");
        rl.close();
    }
}

// Arrancar script
main();
