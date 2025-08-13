// 1. 導入需要的套件
const express = require('express');
const cors = require('cors');
const ModbusRTU = require("modbus-serial");
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const corsOptions = {
    origin: 'https://workkkkkkez00m.github.io',
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

let httpsOptions;
try {
    httpsOptions = {
        key: fs.readFileSync(path.join(__dirname, 'key.pem')),
        cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
    };
} catch (e) {
    console.warn("SSL 憑證檔案 (key.pem, cert.pem) 未找到，將以不安全的 HTTP 模式啟動。");
}

// ★ Modbus 用戶端
const client = new ModbusRTU();
const modbusHost = "192.168.41.223";
const modbusPort = 502;
const modbusSlaveId = 1;

// ★ 核心修改：將連線的邏輯，封裝在一個函式中
async function ensureModbusConnection() {
    if (client.isOpen) {
        return true; // 如果已連線，直接返回成功
    }
    console.log(`[Modbus Client] 連線已中斷，正在嘗試重新連接到 ${modbusHost}:${modbusPort}...`);
    try {
        // 在連線前，先關閉可能存在的舊連線
        client.close(() => {});
        // 重新建立 TCP 連線
        await client.connectTCP(modbusHost, { port: modbusPort });
        client.setID(modbusSlaveId);
        console.log("[Modbus Client] 已成功重新連接到 Modbus 模擬器。");
        return true;
    } catch (err) {
        console.error("[Modbus Client] 重新連接失敗:", err.message);
        return false;
    }
}
// ★ 伺服器啟動時，進行第一次連線
ensureModbusConnection();

// --- 模擬資料庫與即時數據 ---

// 4. 原有的監控點資料 
let monitoringPoints = [
    { id: 1, name: "AW2168", text: "窗戶", status: "關閉" },
    { id: 2, name: "ADW2011", text: "門位", status: "關閉" },
    { id: 3, name: "ADW3065", text: "門位", status: "關閉" },
    { id: 4, name: "ADW3064", text: "門位", status: "關閉" },
    { id: 5, name: "ADW3063", text: "門位", status: "關閉" },
    { id: 6, name: "ADW1019", text: "門位", status: "關閉" },
    { id: 7, name: "ADW4031", text: "門位", status: "關閉" },
    { id: 8, name: "ADW3059", text: "門位", status: "關閉" },
    { id: 9, name: "ADW3061", text: "門位", status: "關閉" },
    { id: 10, name: "ADW4028", text: "門位", status: "關閉" },
    { id: 11, name: "ADW4029", text: "門位", status: "關閉" },
    { id: 12, name: "ADW3055", text: "門位", status: "關閉" },
    { id: 13, name: "ADW3060", text: "門位", status: "關閉" },
    { id: 14, name: "ADW3056", text: "門位", status: "關閉" },
    { id: 15, name: "ADW3057", text: "門位", status: "關閉" },
    { id: 16, name: "ADW4030", text: "門位", status: "關閉" },
    { id: 17, name: "ADW3062", text: "門位", status: "關閉" },
    { id: 18, name: "ADW3058", text: "門位", status: "關閉" },
    { id: 19, name: "ADW4027", text: "門位", status: "關閉" },
];
setInterval(() => {
    monitoringPoints.forEach(point => {
        if (Math.random() < 0.1) {
            point.status = (point.status === "關閉") ? "開啟" : "關閉";
        }
    });
}, 3000);

// 能源數據結構
let energyData = {
    power: {
        total: { realtime: 0, today: 0, month: 0 },
        residential: { realtime: 150.2, today: 2100.5, month: 55100.7 },
        office: { realtime: 100.3, today: 1150.3, month: 30139.5 }
    },
    water: {
        todayTotal: 0, // 總量初始為 0
        monthTotal: 0, // 總量初始為 0
        todayBreakdown: { residential: 80.2, office: 45.3 },
        monthBreakdown: { residential: 2150.4, office: 990.3 }
    },
    hourlyData: {
        residential: Array.from({ length: 24 }, () => Math.random() * 90 + 30),
        office: Array.from({ length: 24 }, () => Math.random() * 60 + 20),
        total: []
    },
    // ★★★耗能分析數據 ★★★
    consumptionAnalysis: {
        power: 1250.5,      // 電力
        ac: 850.2,          // 空調
        lighting: 450.8,    // 照明
        serverRoom: 320.1,  // 機房
        other: 150.9        // 其他
    }
};

// ★★★ 建立一個專門用來計算總量的函式，確保數據同步 ★★★
function calculateTotals() {
    // 計算電力總量
    energyData.power.total.realtime = energyData.power.residential.realtime + energyData.power.office.realtime;
    energyData.power.total.today = energyData.power.residential.today + energyData.power.office.today;
    energyData.power.total.month = energyData.power.residential.month + energyData.power.office.month;

    // ★★★ 新增：計算水度數總量 ★★★
    energyData.water.todayTotal = energyData.water.todayBreakdown.residential + energyData.water.todayBreakdown.office;
    energyData.water.monthTotal = energyData.water.monthBreakdown.residential + energyData.water.monthBreakdown.office;

    // 計算每小時用電總量
    for (let i = 0; i < 24; i++) {
        energyData.hourlyData.total[i] = energyData.hourlyData.residential[i] + energyData.hourlyData.office[i];
    }
}

// 模擬數據即時變化
setInterval(() => {
    // 更新分區電力數據
    energyData.power.residential.realtime += (Math.random() - 0.5) * 5;
    energyData.power.residential.today += Math.random() * 2;
    energyData.power.residential.month += Math.random() * 2;
    energyData.power.office.realtime += (Math.random() - 0.5) * 5;
    energyData.power.office.today += Math.random() * 2;
    energyData.power.office.month += Math.random() * 2;

    // ★★★ 修改：更新分區的水力數據 ★★★
    energyData.water.todayBreakdown.residential += Math.random() * 0.2;
    energyData.water.todayBreakdown.office += Math.random() * 0.1;
    energyData.water.monthBreakdown.residential += Math.random() * 0.2;
    energyData.water.monthBreakdown.office += Math.random() * 0.1;
    
    // 更新每小時用電圖表數據
    const newResKWh = Math.random() * 90 + 30;
    const newOffKWh = Math.random() * 60 + 20;
    energyData.hourlyData.residential.shift();
    energyData.hourlyData.residential.push(newResKWh);
    energyData.hourlyData.office.shift();
    energyData.hourlyData.office.push(newOffKWh);
    
    // ★★★ 在每次更新分區數據後，都重新計算一次總量 ★★★
    calculateTotals();

}, 2000);

// --- ★★★ 歷史紀錄數據生成邏輯 ★★★ ---

// 台灣電力公司 2023 年的電力排碳係數 (公斤 CO2e / 度)
const CARBON_EMISSION_FACTOR = 0.495;

function generateHistoricalData(dateStr) {
    // 根據日期生成一個隨機種子，讓同一天的數據保持一致
    const seed = dateStr.split('-').reduce((acc, val) => acc + parseInt(val), 0);
    const random = (min, max) => {
        const x = Math.sin(seed) * 10000;
        // 簡單的偽隨機數生成
        return min + (x - Math.floor(x)) * (max - min);
    };

    const officeConsumption = {
        power: random(1200, 1500),
        ac: random(800, 1000),
        lighting: random(400, 500),
        serverRoom: random(300, 400),
        other: random(150, 200)
    };
    
    const residentialConsumption = random(2000, 2500);

    const totalOffice = Object.values(officeConsumption).reduce((sum, val) => sum + val, 0);
    const totalConsumption = totalOffice + residentialConsumption;
    const carbonEmission = totalConsumption * CARBON_EMISSION_FACTOR;

    return {
        date: dateStr,
        officeConsumption,
        totalOfficeConsumption: totalOffice,
        residentialConsumption,
        totalConsumption,
        carbonEmission
    };
}

// ★★★ 火警偵測器數據 ★★★
// 我們為不同樓層定義不同的偵測器
const fireAlarmData = {
    "1f": [
        { id: "FA-1-01", name: "??1048_28", locationName: "空間 A", active: true },        
    ],
      
};

// ★★★ 模擬火警隨機發生與解除 ★★★
setInterval(() => {
    // 遍歷所有樓層的所有偵測器
    Object.keys(fireAlarmData).forEach(floor => {
        fireAlarmData[floor].forEach(detector => {
            // 用一個很小的機率來觸發或解除警報
            if (Math.random() < 0.3) {
                detector.active = !detector.active; // 切換狀態 (true/false)
                console.log(`火警狀態變更: ${floor} - ${detector.locationName} 的警報狀態為 ${detector.active}`);
            }
        });
    });
}, 5000); // 每 5 秒鐘檢查一次

// ★★★ 給排水系統 (泵浦) 數據 ★★★
const plumbingData = {
    "b3f": [
        { id: "PUMP-B3-01", name: "PD", locationName: "廢水泵浦" },
        { id: "PUMP-B3-02", name: "PD_1", locationName: "廢水泵浦" },
        { id: "PUMP-B3-03", name: "PD_2", locationName: "雨水泵浦" },
        { id: "PUMP-B3-04", name: "PD_3", locationName: "污水泵浦" },
        { id: "PUMP-B3-05", name: "PD_4", locationName: "污水泵浦" },
        { id: "PUMP-B3-06", name: "PD_5", locationName: "雨水泵浦" },
        { id: "PUMP-B3-07", name: "PD_6", locationName: "雨水泵浦" },
        { id: "PUMP-B3-08", name: "PD_7", locationName: "廢水泵浦" },
        { id: "PUMP-B3-09", name: "PD_8", locationName: "雨水泵浦" },
        { id: "PUMP-B3-10", name: "PD_9", locationName: "廢水泵浦" },
        { id: "PUMP-B3-11", name: "PD_10", locationName: "廢水泵浦" },           

        // ★ 需要用「點擊查詢」功能，找到模型中泵浦的真實名稱來替換 "Pump_A_Name_In_Model"
    ]
    
};

// ★★★ 模擬泵浦隨機啟停與數據變化的邏輯 (最終版) ★★★
const waterLevels = ["低", "中", "高", "高高"];

// 1. 建立一個專門用來更新單一泵浦狀態的函式
function updatePumpState(pump) {
    // 模擬水位隨機變化
    pump.waterLevel = waterLevels[Math.floor(Math.random() * waterLevels.length)];

    // 根據新的運作邏輯來決定狀態
    if (Math.random() < 0.05) {
        pump.status = "故障";
    } else if (pump.waterLevel === "高" || pump.waterLevel === "高高") {
        pump.status = "運轉中";
    } else {
        pump.status = "停止";
    }
    
    // 根據最終狀態，模擬對應的耗電量
    if (pump.status === '運轉中') {
        pump.powerConsumption = parseFloat((2.5 + Math.random()).toFixed(2));
    } else {
        // 如果狀態是「停止」或「故障」，耗電量就歸零
        pump.powerConsumption = 0.0;
    }
}

// 2. 在伺服器啟動時，為所有泵浦「產生」符合規則的初始狀態
Object.keys(plumbingData).forEach(floor => {
    plumbingData[floor].forEach(pump => {
        updatePumpState(pump); // 立刻執行一次來初始化
    });
});

// 3. 設定計時器，週期性地更新狀態
setInterval(() => {
    Object.keys(plumbingData).forEach(floor => {
        plumbingData[floor].forEach(pump => {
            updatePumpState(pump); // 持續呼叫同一個邏輯
            console.log(`泵浦狀態變更: ${floor} - ${pump.locationName} | 水位: ${pump.waterLevel} -> 狀態: ${pump.status}`);
        });
    });
}, 4000);

// ★★★ 停車管理系統數據 ★★★
const parkingData = {
    "b3f": [
            // 標準車位 (119個: StandardPK 到 StandardPK_118)
            ...Array.from({ length: 119 }, (_, i) => {
                const id = String(i + 1).padStart(2, '0');
                const name = i === 0 ? "StandardPK" : `StandardPK_${i}`;
                const locationNum = i + 1;
                // 設定一些車位有車的初始狀態
                const hasCarPositions = [3, 6, 9, 13, 16, 19]; // 對應原本有車的位置
                const status = hasCarPositions.includes(i + 1) ? "有車" : "空位";
        
                return {
                    id: `PS-B3-${String(i + 1).padStart(3, '0')}`,
                    name: name,
                    locationName: `車位 #${locationNum}`,
                    status: status
                };
            }),
    
            // 小型車位 (25個: SmallPK 到 SmallPK_24)
            ...Array.from({ length: 25 }, (_, i) => {
                const id = String(i + 120).padStart(3, '0');
                const name = i === 0 ? "SmallPK" : `SmallPK_${i}`;
                const locationNum = i + 120;
                // 設定大部分小型車位有車的初始狀態
                const status = i >= 1 && i <= 24 ? "有車" : "空位";
        
                return {
                    id: `PS-B3-${id}`,
                    name: name,
                    locationName: `車位 #${locationNum}`,
                    status: status
                };
            })
        ],

    "b2f": [
        // 標準車位 (115個: StandardPKB2 到 StandardPKB2_115)
        ...Array.from({ length: 116 }, (_, i) => {
            const id = String(i + 1).padStart(2, '0');
            const name = i === 0 ? "StandardPKB2" : `StandardPKB2_${i}`;
            const locationNum = 143 + i;

            return {
                id: `PS-B2-${id}`,
                name: name,
                locationName: `車位 #${locationNum}`,
                status: "空位"
            };
        }),

        // 小型車位 (22個: SmallPKB2 到 SmallPKB2_22)
        ...Array.from({ length: 23 }, (_, i) => {
            const id = String(i + 117).padStart(2, '0');
            const name = i === 0 ? "SmallPKB2" : `SmallPKB2_${i}`;
            const locationNum = 258 + i;

            return {
                id: `PS-B2-${id}`,
                name: name,
                locationName: `車位 #${locationNum}`,
                status: "空位"
            };
        })
    ],

    "b1f": [
        { id: "PS-B1-01", name: "StandardPKB1", locationName: "車位 #282", status: "空位", type: "car" },
        { id: "PS-B1-02", name: "StandardPKB1_1", locationName: "車位 #283", status: "空位", type: "car"  },
        { id: "PS-B1-03", name: "StandardPKB1_2", locationName: "車位 #284", status: "空位", type: "car"  },
        { id: "PS-B1-04", name: "StandardPKB1_3", locationName: "車位 #285", status: "空位", type: "car"  },
        { id: "PS-B1-05", name: "StandardPKB1_4", locationName: "車位 #286", status: "空位", type: "car"  },
        { id: "PS-B1-06", name: "StandardPKB1_5", locationName: "車位 #287", status: "空位", type: "car"  },
        { id: "PS-B1-07", name: "StandardPKB1_6", locationName: "車位 #288", status: "空位", type: "car"  },
        { id: "PS-B1-08", name: "StandardPKB1_7", locationName: "車位 #289", status: "空位", type: "car"  },
        { id: "PS-B1-09", name: "StandardPKB1_8", locationName: "車位 #290", status: "空位", type: "car"  },
        { id: "PS-B1-10", name: "StandardPKB1_9", locationName: "車位 #291", status: "空位", type: "car"  },
        { id: "PS-B1-11", name: "StandardPKB1_10", locationName: "車位 #292", status: "空位", type: "car"  },
        { id: "PS-B1-12", name: "StandardPKB1_11", locationName: "車位 #293", status: "空位", type: "car"  },
        { id: "PS-B1-13", name: "StandardPKB1_12", locationName: "車位 #294", status: "空位", type: "car"  },
        { id: "PS-B1-14", name: "StandardPKB1_13", locationName: "車位 #295", status: "空位", type: "car"  },
        { id: "PS-B1-15", name: "StandardPKB1_14", locationName: "車位 #296", status: "空位", type: "car"  },
        { id: "PS-B1-16", name: "SmallPKB1", locationName: "車位 #297", status: "空位", type: "car"  },
        { id: "PS-B1-17", name: "SmallPKB1_1", locationName: "車位 #298", status: "空位", type: "car"  },
        { id: "PS-B1-18", name: "SmallPKB1_2", locationName: "車位 #299", status: "空位", type: "car"  },
        { id: "PS-B1-19", name: "DisabledParking_5", locationName: "車位 #300", status: "空位", type: "car"  },
        { id: "PS-B1-20", name: "DisabledParkingB_1", locationName: "車位 #301", status: "空位", type: "car"  },
        { id: "PS-B1-21", name: "DisabledParking_1", locationName: "車位 #302", status: "空位", type: "car"  },
        { id: "PS-B1-22", name: "DisabledParking_3", locationName: "車位 #303", status: "空位", type: "car"  },                    
        // 機車位 (從StandardMPK1008到StandardMPK1492，共485個)
        /*...Array.from({ length: 499 }, (_, i) => {
            const num = i + 1;
            const paddedNum = String(num).padStart(3, '0');
            const mpkNum = 1008 + i;
        
            return {
                id: `PSm-B1-${String(num).padStart(2, '0')}`,
                name: `StandardMPK${mpkNum}`,
                locationName: `機車位 #${paddedNum}`,
                status: "空位",
                type: "motorcycle"
            };
        })*/
    ],
    
};

// ★★★ 模擬停車位狀態隨機變化 ★★★
setInterval(() => {
    Object.keys(parkingData).forEach(floor => {
        parkingData[floor].forEach(space => {
            if (Math.random() < 0.15) { // 15% 的機率改變狀態
                // 根據加權機率來決定新狀態
                const rand = Math.random();
                if (rand < 0.45) {
                    space.status = "空位";      // 45% 機率
                } else if (rand < 0.95) {
                    space.status = "有車";      // 45% 機率
                } else {
                    space.status = "故障";      // 10% 機率
                }
                console.log(`停車位狀態變更: ${floor} - ${space.locationName} 的狀態為 ${space.status}`);
            }
        });
    });
}, 3000); // 每 3 秒鐘檢查一次

// ★★★ 車道號誌數據 ★★★
let trafficLightData = {
    "b3f": {
        "main_entrance": { 
            id: "TL-B3-01", 
            name: "Lane", // B3F 主入口號誌燈的模型名稱
            locationName: "主車道號誌",
            status: "green" 
        }
    },
    "b2f": {
        "up_lane": {
            id: "TL-B2-UP",
            name: "Laneb2u", // B2F 上行車道號誌燈的模型名稱
            locationName: "上行車道",
            status: "green"
        },
        "down_lane": {
            id: "TL-B2-DOWN",
            name: "Laneb2d", // B2F 下行車道號誌燈的模型名稱
            locationName: "下行車道",
            status: "red"
        }
    },
    "b1f": {
        "up_lane": {
            id: "TL-B1-UP",
            name: "Laneb1u", // B1F 上行車道號誌燈的模型名稱
            locationName: "上行車道",
            status: "green"
        },
        "down_lane": {
            id: "TL-B1-DOWN",
            name: "Laneb1d", // B1F 下行車道號誌燈的模型名稱
            locationName: "下行車道",
            status: "red"
        }
    }
};

// ★★★ 模擬車道號誌狀態隨機變化 ★★★
setInterval(() => {
    Object.keys(trafficLightData).forEach(floor => {
        Object.keys(trafficLightData[floor]).forEach(lightId => {
            if (Math.random() < 0.3) { // 30% 的機率改變狀態
                trafficLightData[floor][lightId].status = (trafficLightData[floor][lightId].status === "green") ? "red" : "green";
                console.log(`車道號誌狀態變更: ${floor} - ${lightId} 的狀態為 ${trafficLightData[floor][lightId].status}`);
            }
        });
    });
}, 5000); // 每 5 秒鐘檢查一次

// ★★★ 電梯數據結構與模擬邏輯 (V2.0) ★★★
const allFloors = ['5F', '4F', '3F', '2F', '1F', 'B1F', 'B2F', 'B3F'];
const runStatuses = ["自動運轉", "自動休止", "停電運轉", "電梯故障"];
let powerOutageStartTime = 0; // 記錄停電開始時間
const POWER_OUTAGE_MIN_DURATION = 3000; // 停電最少維持3秒鐘

let elevatorsData = [
    { id: 1, name: "1號昇降梯", serviceFloors: ['5F', '4F', '3F', '2F', '1F'], currentFloor: '1F', direction: 'idle', doorStatus: 'closed', carCalls: [], hallCalls: [], emergencyCall: false, lastEmergencyTime: 0, runTime: 2, startupCount: 3, manualMode: false  },
    { id: 2, name: "2號昇降梯", serviceFloors: ['5F', '4F', '3F', '2F', '1F'], currentFloor: '1F', direction: 'idle', doorStatus: 'closed', carCalls: [], hallCalls: [], emergencyCall: false, lastEmergencyTime: 0, runTime: 1, startupCount: 4, manualMode: false  },
    { id: 3, name: "3號無障礙昇降梯", serviceFloors: allFloors, currentFloor: 'B3F', direction: 'idle', doorStatus: 'closed', carCalls: [], hallCalls: [], emergencyCall: false, lastEmergencyTime: 0, runTime: 21, startupCount: 19, manualMode: false  },
    { id: 4, name: "4號無障礙昇降梯", serviceFloors: allFloors, currentFloor: 'B3F', direction: 'idle', doorStatus: 'closed', carCalls: [], hallCalls: [], emergencyCall: false, lastEmergencyTime: 0, runTime: 10, startupCount: 11, manualMode: false  },
    { id: 5, name: "5號緊急昇降梯", serviceFloors: allFloors, currentFloor: 'B3F', direction: 'idle', doorStatus: 'closed', carCalls: [], hallCalls: [], emergencyCall: false, lastEmergencyTime: 0, runTime: 25, startupCount: 22, manualMode: false  },
];

setInterval(() => {
    // 1. 隨機產生叫車信號 - 修正：只分配給運作中的電梯
    const randomFloor = allFloors[Math.floor(Math.random() * allFloors.length)];
    if (Math.random() < 0.1) {
        const randomDirection = Math.random() > 0.5 ? 'up' : 'down';
        
        // ★ 修正：只有運作中的電梯才能接收樓層呼叫
        const operatingElevators = elevatorsData.filter(e => 
            !e.manualMode && // 非手動模式
            (e.runStatus === "自動運轉" || e.runStatus === "停電運轉") && // 運轉狀態
            e.serviceFloors.includes(randomFloor) // 服務該樓層
        );
        
        // 如果有可用的電梯，隨機選擇一台來接收呼叫
        if (operatingElevators.length > 0) {
            const targetElevator = operatingElevators[Math.floor(Math.random() * operatingElevators.length)];
            if (!targetElevator.hallCalls.some(c => c.floor === randomFloor)) {
                targetElevator.hallCalls.push({ floor: randomFloor, direction: randomDirection });
                console.log(`樓層呼叫分配: ${randomFloor} -> ${targetElevator.name}`);
            }
        }
    }
    
    // 2. 檢查當前是否有停電狀態
    const currentTime = Date.now();
    const currentPowerOutage = elevatorsData.some(e => e.runStatus === "停電運轉");
    
    // 記錄停電開始時間
    if (currentPowerOutage && powerOutageStartTime === 0) {
        powerOutageStartTime = currentTime;
        console.log("系統進入停電模式");
    }
    
    // 如果目前沒有停電，重置停電開始時間
    if (!currentPowerOutage) {
        powerOutageStartTime = 0;
    }
    
    // 3. 更新每台電梯的狀態（但要考慮停電持續時間）
    elevatorsData.forEach(elevator => {
        // ★ 修正運轉狀態邏輯 - 確保1-4號電梯永遠不會出現"停電運轉"狀態
        if (Math.random() < 0.1) {
            if (elevator.id === 5) {
                // 如果停電已經持續超過3秒，才允許5號電梯離開停電狀態
                if (elevator.runStatus === "停電運轉" && 
                    powerOutageStartTime > 0 && 
                    (currentTime - powerOutageStartTime) < POWER_OUTAGE_MIN_DURATION) {
                    // 停電時間未滿3秒，保持停電狀態
                    elevator.runStatus = "停電運轉";
                } else {
                    // 5號電梯可以隨機切換到所有狀態
                    elevator.runStatus = runStatuses[Math.floor(Math.random() * runStatuses.length)];
                }
            } else {
                // ★ 1-4號電梯只能有前三種狀態，永遠不會出現"停電運轉"
                const availableStatuses = ["自動運轉", "自動休止", "電梯故障"]; // 明確排除"停電運轉"
                elevator.runStatus = availableStatuses[Math.floor(Math.random() * availableStatuses.length)];
            }
        }

        // ★ 確保電梯有初始運轉狀態
        if (!elevator.runStatus) {
            elevator.runStatus = "自動運轉";
        }

        // ★ 初始化統計計數器
        elevator.secondsCounter = elevator.secondsCounter || 0;
        elevator.lastDirection = elevator.lastDirection || 'idle';

        // ★ 運轉時間統計 - 只要電梯處於運轉狀態就累積時間
        if (elevator.runStatus === "自動運轉" || elevator.runStatus === "停電運轉") {
            elevator.secondsCounter += 2; // 每2秒累積一次
        
            // 每60秒轉換為1分鐘
            if (elevator.secondsCounter >= 60) {
                elevator.runTime += 1;
                elevator.secondsCounter -= 60;
                console.log(`電梯 ${elevator.name} 運轉時間更新: ${elevator.runTime} 分鐘`);
            }
        }

        // ★ 啟動次數統計 - 偵測方向變化
        if (elevator.lastDirection === 'idle' && elevator.direction !== 'idle') {
            elevator.startupCount++;
            console.log(`電梯 ${elevator.name} 啟動次數更新: ${elevator.startupCount}`);
        }
    
        // 更新上次方向記錄
        elevator.lastDirection = elevator.direction;
    });

    // ★ 檢查是否有5號電梯處於停電運轉狀態（精確檢查）
    const fiveElevator = elevatorsData.find(e => e.id === 5);
    const hasPowerOutage = fiveElevator && fiveElevator.runStatus === "停電運轉";
    
    // 4. 根據停電狀態處理電梯邏輯
    elevatorsData.forEach(elevator => {
        // ★ 如果電梯處於手動模式，就跳過所有自動模擬邏輯
        if (elevator.manualMode) {
            return; 
        }
        
        // ★ 停電運轉邏輯 - 只有當5號電梯處於「停電運轉」時，其他電梯才進入停電停止
        if (hasPowerOutage) {
            if (elevator.id !== 5) {
                // 1-4號電梯在停電時停止運轉且無條件開門
                elevator.carCalls = [];
                elevator.hallCalls = [];
                elevator.direction = 'idle';
                elevator.doorStatus = 'open'; // 無條件開門
                elevator.runStatus = "停電停止"; // 特殊狀態表示因停電而停止
                return; // 跳過所有邏輯
            }
            // 5號電梯在停電時仍可正常運轉（在停電運轉狀態下）
        } else {
            // ★ 停電解除邏輯 - 當5號電梯離開停電運轉狀態時，恢復1-4號電梯的正常狀態
            if (elevator.runStatus === "停電停止") {
                elevator.runStatus = "自動運轉"; // 恢復為自動運轉
                elevator.doorStatus = 'closed'; // 關閉門
                console.log(`電梯 ${elevator.name} 停電解除，恢復正常運轉`);
            }
        }

        // ★ 緊急呼叫邏輯優化 - 降低機率並加入冷卻時間
        const timeSinceLastEmergency = currentTime - elevator.lastEmergencyTime;
        const cooldownPeriod = 30000; // 30秒冷卻時間

        if (!elevator.emergencyCall && 
            timeSinceLastEmergency > cooldownPeriod && 
            Math.random() < 0.01) { // 降低到1%機率
            
            elevator.emergencyCall = true; // 只設為 true，不會自動變成 false
            elevator.lastEmergencyTime = currentTime;
            console.log(`電梯 ${elevator.name} 發生緊急呼叫！`);
        }

        // ★ 修正：檢查電梯是否應該停止運作並清除呼叫
        if (elevator.runStatus === "自動休止" || elevator.runStatus === "電梯故障") {
            elevator.carCalls = [];
            elevator.hallCalls = []; // 清除樓層呼叫
            elevator.direction = 'idle';
            elevator.doorStatus = 'closed';
            return; // 跳過所有移動邏輯
        }

        // ★ 停電停止狀態處理 - 無條件開門且不執行任何運轉邏輯
        if (elevator.runStatus === "停電停止") {
            elevator.doorStatus = 'open'; // 確保門始終開啟
            return; // 跳過所有移動邏輯
        }

        // ★ 只有在"自動運轉"或"停電運轉"狀態下才執行正常邏輯
        if (elevator.runStatus === "自動運轉" || elevator.runStatus === "停電運轉") {
            // ★ 優化車廂內叫車生成邏輯
            if (Math.random() < 0.08) { // 提高叫車機率到8%
                const randomCarCallFloor = elevator.serviceFloors[Math.floor(Math.random() * elevator.serviceFloors.length)];
                // 避免重複叫車同一樓層，且不叫車到當前樓層
                if (!elevator.carCalls.includes(randomCarCallFloor) && randomCarCallFloor !== elevator.currentFloor) {
                    elevator.carCalls.push(randomCarCallFloor);
                    console.log(`電梯 ${elevator.name} 車廂內叫車: ${randomCarCallFloor}`);
                }
            }

            // ★ 限制車廂內叫車數量，避免過多
            if (elevator.carCalls.length > 3) {
                elevator.carCalls = elevator.carCalls.slice(0, 3); // 最多保留3個叫車
            }

            const currentFloorIndex = elevator.serviceFloors.indexOf(elevator.currentFloor);
            const allCalls = [...elevator.carCalls, ...elevator.hallCalls.map(c => c.floor)];
            
            // 判斷是否在當前樓層開門
            if (allCalls.includes(elevator.currentFloor)) {
                elevator.direction = 'idle';
                elevator.doorStatus = 'open';
                // 移除已到達的叫車樓層
                elevator.carCalls = elevator.carCalls.filter(f => f !== elevator.currentFloor);
                elevator.hallCalls = elevator.hallCalls.filter(c => c.floor !== elevator.currentFloor);
                setTimeout(() => elevator.doorStatus = 'closed', 1500);
                return;
            }

            // 判斷移動方向
            if (elevator.direction === 'idle' && allCalls.length > 0) {
                const nextTargetFloor = allCalls[0];
                const nextTargetIndex = elevator.serviceFloors.indexOf(nextTargetFloor);
                elevator.direction = nextTargetIndex > currentFloorIndex ? 'down' : 'up';
            }

            // 執行移動
            if (elevator.direction === 'up' && currentFloorIndex > 0) {
                elevator.currentFloor = elevator.serviceFloors[currentFloorIndex - 1];
            } else if (elevator.direction === 'down' && currentFloorIndex < elevator.serviceFloors.length - 1) {
                elevator.currentFloor = elevator.serviceFloors[currentFloorIndex + 1];
            } else {
                elevator.direction = 'idle';
            }
        }
    });
}, 2000);

// ★★★ 產生電梯月度報告的函式 ★★★
function generateElevatorMonthlyReport(year, month, elevatorId) {
    const daysInMonth = new Date(year, month, 0).getDate();
    const dailySummaries = [];
    const eventLogs = [];
    const elevatorName = elevatorsData.find(e => e.id == elevatorId)?.name || `${elevatorId}號昇降梯`;

    // 修正隨機數生成函式
    const seed = parseInt(year) * 1000 + parseInt(month) * 100 + parseInt(elevatorId);
    const random = (min, max, day = 1) => {
        const x = Math.sin(seed * day * 1.23) * 10000;
        return Math.floor(min + Math.abs(x - Math.floor(x)) * (max - min + 1));
    };

    // 產生每日摘要數據
    for (let day = 1; day <= daysInMonth; day++) {
        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        dailySummaries.push({
            日期: date,
            運轉時間: random(180, 480, day), // 3-8小時（分鐘）
            啟動次數: random(15, 45, day),
            故障次數: random(0, 2, day * 7) // 較低的故障機率
        });

        // 產生事件紀錄
        const numEvents = random(3, 8, day);
        for (let i = 0; i < numEvents; i++) {
            const hour = random(6, 22, day + i); // 工作時間範圍
            const minute = random(0, 59, day + i * 3);
            const second = random(0, 59, day + i * 5);
            const timestamp = `${date} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
            
            const eventType = random(1, 10, day * i);
            let event, floor;
            
            // 根據電梯ID決定服務樓層
            const serviceFloors = elevatorId <= 2 ? 
                ['1F', '2F', '3F', '4F', '5F'] : 
                ['B3F', 'B2F', 'B1F', '1F', '2F', '3F', '4F', '5F'];
            
            floor = serviceFloors[random(0, serviceFloors.length - 1, day + i * 2)];
            
            if (eventType <= 4) {
                event = "啟動";
            } else if (eventType <= 7) {
                event = "到達樓層";
            } else if (eventType <= 8) {
                event = "門開啟";
            } else if (eventType <= 9) {
                event = "門關閉";
            } else {
                event = "緊急呼叫";
            }
            
            eventLogs.push({ 
                時間: timestamp, 
                電梯: elevatorName, 
                事件: event, 
                樓層: floor 
            });
        }
    }

    // 按時間排序事件紀錄
    eventLogs.sort((a, b) => new Date(a.時間) - new Date(b.時間));
    
    return { dailySummaries, eventLogs };
}

// ★★★ 空調控制系統數據  ★★★
const acData = {
    "1f": [
        { id: "AC-1F-01", name: "PEY-SM30JA(L)-TH_1", modbusAddress: 0, locationName: "防災中心空調", status: "未知", mode: "送風", setTemperature: 25, currentTemperature: 26, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
        { id: "AC-1F-02", name: "PEY-SM30JA(L)-TH002_1", modbusAddress: 1, locationName: "辦公室空調", status: "未知", mode: "冷氣", setTemperature: 24, currentTemperature: 28, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "停止"  },
        { id: "AC-1F-03", name: "PEY-SM30JA(L)-TH001_1", modbusAddress: 2, locationName: "門廳空調", status: "未知", mode: "冷氣", setTemperature: 22, currentTemperature: 21, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
        { id: "AC-1F-04", name: "PEY-SM30JA(L)-TH003_1", modbusAddress: 3, locationName: "閱覽室空調1", status: "未知", mode: "送風", setTemperature: 22, currentTemperature: 21, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
        { id: "AC-1F-05", name: "PEY-SM30JA(L)-TH004_1", modbusAddress: 4, locationName: "閱覽室空調2", status: "未知", mode: "冷氣", setTemperature: 22, currentTemperature: 21, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
        { id: "AC-1F-06", name: "PEY-SM30JA(L)-TH005_1", modbusAddress: 5, locationName: "閱覽室空調3", status: "未知", mode: "冷氣", setTemperature: 22, currentTemperature: 21, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
        { id: "AC-1F-07", name: "PEY-SM30JA(L)-TH006_1", modbusAddress: 6, locationName: "閱覽室空調4", status: "未知", mode: "冷氣", setTemperature: 22, currentTemperature: 21, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
        { id: "AC-1F-08", name: "PEY-SM30JA(L)-TH007_1", modbusAddress: 7, locationName: "閱覽室空調5", status: "未知", mode: "冷氣", setTemperature: 22, currentTemperature: 21, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
        { id: "AC-1F-09", name: "PEY-SM30JA(L)-TH008_1", modbusAddress: 8, locationName: "閱覽室空調6", status: "未知", mode: "冷氣", setTemperature: 22, currentTemperature: 21, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
        { id: "AC-1F-10", name: "PEY-SM30JA(L)-TH009_1", modbusAddress: 9, locationName: "閱覽室空調7", status: "未知", mode: "冷氣", setTemperature: 22, currentTemperature: 21, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
        { id: "AC-1F-11", name: "PEY-SM30JA(L)-TH010_1", modbusAddress: 10, locationName: "閱覽室空調8", status: "未知", mode: "冷氣", setTemperature: 22, currentTemperature: 21, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
        { id: "AC-1F-12", name: "PEY-SM30JA(L)-TH011_1", modbusAddress: 11, locationName: "閱覽室空調9", status: "未知", mode: "冷氣", setTemperature: 22, currentTemperature: 21, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
        { id: "AC-1F-13", name: "PEY-SM30JA(L)-TH012_1", modbusAddress: 12, locationName: "閱覽室空調10", status: "未知", mode: "冷氣", setTemperature: 22, currentTemperature: 21, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
        { id: "AC-1F-14", name: "PEY-SM30JA(L)-TH013_1", modbusAddress: 13, locationName: "閱覽室空調11", status: "未知", mode: "冷氣", setTemperature: 22, currentTemperature: 21, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
        { id: "AC-1F-15", name: "PEY-SM30JA(L)-TH014_1", modbusAddress: 14, locationName: "閱覽室空調12", status: "未知", mode: "冷氣", setTemperature: 22, currentTemperature: 21, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
        { id: "AC-1F-16", name: "PEY-SM30JA(L)-TH015_1", modbusAddress: 15, locationName: "閱覽室空調13", status: "未知", mode: "冷氣", setTemperature: 22, currentTemperature: 21, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
        { id: "AC-1F-17", name: "PEY-SM30JA(L)-TH016_1", modbusAddress: 16, locationName: "店鋪空調1", status: "未知", mode: "冷氣", setTemperature: 22, currentTemperature: 21, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
        { id: "AC-1F-18", name: "PEY-SM30JA(L)-TH017_1", modbusAddress: 17, locationName: "店鋪空調2", status: "未知", mode: "冷氣", setTemperature: 22, currentTemperature: 21, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
        { id: "AC-1F-19", name: "PEY-SM30JA(L)-TH018_1", modbusAddress: 18, locationName: "店鋪空調3", status: "未知", mode: "冷氣", setTemperature: 22, currentTemperature: 21, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
        { id: "AC-1F-20", name: "PEY-SM30JA(L)-TH019_1", modbusAddress: 19, locationName: "店鋪空調4", status: "未知", mode: "冷氣", setTemperature: 22, currentTemperature: 21, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
        { id: "AC-1F-21", name: "PEY-SM30JA(L)-TH020_1", modbusAddress: 20, locationName: "店鋪空調5", status: "未知", mode: "冷氣", setTemperature: 22, currentTemperature: 21, fanSpeed: "自動", verticalSwing: "auto", horizontalSwing: "auto", previousStatus: "運轉中"  },
       
    ],    
};
// ★★★ 模擬空調狀態隨機變化  ★★★
const acModes = ["送風", "冷氣", "暖氣", "除濕"];
setInterval(async () => {
    try {
        const isConnected = await ensureModbusConnection();
        if (!isConnected) return;

        for (const floor in acData) {
            for (const unit of acData[floor]) {
                // 1. 讀取開關狀態 (Holding Registers, 位址 0-20)
                const statusResponse = await client.readHoldingRegisters(unit.modbusAddress, 1);
                const newStatus = statusResponse.data[0] === 256 ? "運轉中" : "停止";
                if (unit.status !== newStatus) {
                    unit.status = newStatus;
                }

                // 2. ★ 修正：讀取現在溫度 (根據CSV配置，地址從22開始，每個設備+2)
                const tempReadAddress = 22 + (unit.modbusAddress * 2);
                const currentTempResponse = await client.readHoldingRegisters(tempReadAddress, 1);
                unit.currentTemperature = currentTempResponse.data[0] / 10.0;

                // 3. ★ 修正：讀取設定溫度 (使用相同的溫度地址)
                const setTempResponse = await client.readHoldingRegisters(tempReadAddress, 1);
                unit.setTemperature = setTempResponse.data[0] / 10.0;
                
                console.log(`[溫度監控] ${unit.locationName} (地址:${tempReadAddress}) - 現在溫度: ${unit.currentTemperature}°C, 設定溫度: ${unit.setTemperature}°C`);
            }
        }
    } catch (err) {
        console.error(`[Modbus Client] 讀取 Modbus 數據失敗: ${err.message}`);
        client.close(() => {});
    }
}, 3000);

// --- 建立 API 端點 ---
app.get('/api/status', (req, res) => {
    res.json(monitoringPoints);
});
app.get('/api/energy', (req, res) => {
    res.json(energyData);
});

// ★★★ 給歷史紀錄用的 API 端點 ★★★
app.get('/api/historical-power', (req, res) => {
    const { date } = req.query; // 從前端請求的 URL 中獲取 date 參數
    if (!date) {
        return res.status(400).json({ error: '缺少日期參數' });
    }
    const historicalData = generateHistoricalData(date);
    res.json(historicalData);
});

// ★★★ 專門給「月份匯出」用的 API 端點 ★★★
app.get('/api/monthly-power-report', (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) {
        return res.status(400).json({ error: '缺少年份或月份參數' });
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    const reportData = [];

    for (let day = 1; day <= daysInMonth; day++) {
        // 格式化日期字串為 YYYY-MM-DD
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        reportData.push(generateHistoricalData(dateStr));
    }
    
    res.json(reportData);
});

// ★★★ 火警系統 API 端點 ★★★
app.get('/api/fire-alarm/:floor', (req, res) => {
    const { floor } = req.params; // 從 URL 路徑中獲取樓層，例如 "1f"
    const data = fireAlarmData[floor] || []; // 如果找不到該樓層數據，就回傳空陣列
    res.json(data);
});

// ★★★ 「給排水系統」用的 API 端點 ★★★
app.get('/api/plumbing/:floor', (req, res) => {
    const { floor } = req.params;
    const data = plumbingData[floor] || [];
    res.json(data);
});

// ★★★ 「停車管理系統」用的 API 端點 ★★★
app.get('/api/parking/:floor', (req, res) => {
    const { floor } = req.params;
    const data = parkingData[floor] || [];
    res.json(data);
});

// ★★★「車道號誌」用的 API 端點 ★★★
app.get('/api/traffic-light/:floor', (req, res) => {
    const { floor } = req.params;
    const data = trafficLightData[floor] || {};
    res.json(data);
});

// ★★★ 「電梯監控系統」用的 API 端點 ★★★
app.get('/api/elevators', (req, res) => {
    // 處理電梯數據，確保 carCalls 陣列格式正確
    const processedElevators = elevatorsData.map(elevator => ({
        ...elevator,
        // 確保 carCalls 是陣列格式，方便前端處理
        carCalls: elevator.carCalls || [],
        // 提供額外的車廂叫車資訊
        carCallsCount: elevator.carCalls ? elevator.carCalls.length : 0,
        // 按樓層順序排序叫車樓層（從高到低）
        sortedCarCalls: elevator.carCalls ? 
            [...elevator.carCalls].sort((a, b) => {
                const floorOrder = ['5F', '4F', '3F', '2F', '1F', 'B1F', 'B2F', 'B3F'];
                return floorOrder.indexOf(a) - floorOrder.indexOf(b);
            }) : [],
        // 提供下一個目標樓層資訊
        nextTarget: elevator.carCalls && elevator.carCalls.length > 0 ? elevator.carCalls[0] : null
    }));
    
    res.json(processedElevators);
});

// ★★★ 「電梯紀錄匯出」用的 API 端點 ★★★
app.get('/api/elevators/report', (req, res) => {
    try {
        const { year, month, elevatorId } = req.query;
        
        // 參數驗證
        if (!year || !month || !elevatorId) {
            return res.status(400).json({ 
                error: '缺少必要參數',
                required: ['year', 'month', 'elevatorId']
            });
        }

        // 數值驗證
        const yearNum = parseInt(year);
        const monthNum = parseInt(month);
        const elevatorIdNum = parseInt(elevatorId);

        if (isNaN(yearNum) || isNaN(monthNum) || isNaN(elevatorIdNum)) {
            return res.status(400).json({ 
                error: '參數格式錯誤，必須為數字' 
            });
        }

        if (monthNum < 1 || monthNum > 12) {
            return res.status(400).json({ 
                error: '月份必須在 1-12 之間' 
            });
        }

        if (elevatorIdNum < 1 || elevatorIdNum > 5) {
            return res.status(400).json({ 
                error: '電梯ID必須在 1-5 之間' 
            });
        }

        // 產生報告數據
        const reportData = generateElevatorMonthlyReport(yearNum, monthNum, elevatorIdNum);
        
        console.log(`電梯報告生成成功: ${year}-${month}, 電梯ID: ${elevatorId}`);
        res.json(reportData);

    } catch (error) {
        console.error('電梯報告生成錯誤:', error);
        res.status(500).json({ 
            error: '服務器內部錯誤',
            message: error.message 
        });
    }
});

// ★★★ 「解除緊急呼叫」的 POST API 端點 ★★★
app.post('/api/elevators/:id/resolve-emergency', (req, res) => {
    const elevatorId = parseInt(req.params.id);
    const elevator = elevatorsData.find(e => e.id === elevatorId);

    if (elevator) {
        elevator.emergencyCall = false; // 手動解除
        console.log(`電梯 #${elevatorId} 的緊急呼叫已由 API 解除。`);
        res.status(200).json({ message: `Elevator ${elevatorId} emergency resolved.` });
    } else {
        res.status(404).json({ error: `Elevator with id ${elevatorId} not found.` });
    }
});

// ★★★ 切換「手動/自動」模式的 POST API ★★★
app.post('/api/elevators/:id/toggle-manual', (req, res) => {
    const elevatorId = parseInt(req.params.id);
    const elevator = elevatorsData.find(e => e.id === elevatorId);
    if (elevator) {
        elevator.manualMode = !elevator.manualMode;
        // 進入自動模式時，重設狀態
        if (!elevator.manualMode) {
            elevator.direction = 'idle';
            elevator.runStatus = '自動運轉';
        } else {
            elevator.runStatus = '手動運轉';
        }
        console.log(`電梯 #${elevatorId} 的手動模式已切換為: ${elevator.manualMode}`);
        res.status(200).json(elevator);
    } else {
        res.status(404).json({ error: `Elevator with id ${elevatorId} not found.` });
    }
});

// ★★★ 接收「手動控制指令」的 POST API ★★★
app.post('/api/elevators/:id/manual-command', (req, res) => {
    const elevatorId = parseInt(req.params.id);
    const { command } = req.body;
    const elevator = elevatorsData.find(e => e.id === elevatorId);

    if (!elevator) {
        return res.status(404).json({ error: `Elevator with id ${elevatorId} not found.` });
    }

    if (!elevator.manualMode) {
        return res.status(400).json({ error: `Elevator ${elevatorId} is not in manual mode.` });
    }

    const currentFloorIndex = elevator.serviceFloors.indexOf(elevator.currentFloor);
    
    switch (command) {
        case 'up':
            if (currentFloorIndex > 0) {
                elevator.currentFloor = elevator.serviceFloors[currentFloorIndex - 1];
                elevator.direction = 'up';
            } else {
                return res.status(400).json({ error: 'Cannot go up from top floor.' });
            }
            break;
        case 'down':
            if (currentFloorIndex < elevator.serviceFloors.length - 1) {
                elevator.currentFloor = elevator.serviceFloors[currentFloorIndex + 1];
                elevator.direction = 'down';
            } else {
                return res.status(400).json({ error: 'Cannot go down from bottom floor.' });
            }
            break;
        case 'stop':
            elevator.direction = 'idle';
            break;
        case 'open':
            elevator.doorStatus = 'open';
            break;
        case 'close':
            elevator.doorStatus = 'closed';
            break;
        default:
            return res.status(400).json({ error: `Unknown command: ${command}` });
    }
    
    console.log(`收到電梯 #${elevatorId} 的手動指令: ${command}, 當前樓層: ${elevator.currentFloor}`);
    res.status(200).json(elevator);
});
// ★★★ 空調控制系統 API 端點 ★★★
app.get('/api/ac/:floor', (req, res) => {
    const { floor } = req.params;
    const data = acData[floor] || [];
    res.json(data);
});
// ★★★ 接收「模式切換指令」的 POST API ★★★
app.post('/api/ac/:floor/:id/mode', (req, res) => {
    const { floor, id } = req.params;
    const { mode } = req.body;
    
    if (!acData[floor]) {
        return res.status(404).json({ error: `Floor ${floor} not found.` });
    }

    const unit = acData[floor].find(u => u.id === id);

    if (unit) {
        // 驗證傳入的模式是否有效
        const validModes = ["送風", "冷氣", "暖氣", "除濕"];
        if (validModes.includes(mode)) {
            unit.mode = mode;
            console.log(`空調模式已手動切換: ${floor} - ${unit.locationName} 的模式為 ${unit.mode}`);
            res.status(200).json(unit);
        } else {
            res.status(400).json({ error: `Invalid mode: ${mode}` });
        }
    } else {
        res.status(404).json({ error: `AC unit with id ${id} not found on floor ${floor}.` });
    }
});
// ★★★ 空調開關機 API (寫入到 Modbus) ★★★
app.post('/api/ac/:floor/:id/status', async (req, res) => {
    const { floor, id } = req.params;
    const { status } = req.body;
    
    const unit = acData[floor]?.find(u => u.id === id);
    if (!unit) {
        return res.status(404).json({ error: `AC unit not found.` });
    }

    const valueToWrite = (status === "運轉中") ? 256 : 0;

    console.log(`--------------------------------------------------`);
    console.log(`[API] 收到前端請求: ${unit.locationName} -> ${status}`);

    try {
        const isConnected = await ensureModbusConnection();
        if (!isConnected) {
            throw new Error("無法連接到 Modbus 設備。");
        }

        console.log(`[API -> Modbus] 正在發送寫入指令... (位址: ${unit.modbusAddress}, 值: ${valueToWrite})`);        
        client.setID(modbusSlaveId);
        await client.writeRegisters(unit.modbusAddress, [valueToWrite]);
        console.log(`[API -> Modbus] 指令已成功發送！`);
        
        unit.status = status;
        res.status(200).json(unit);

    } catch (err) {
        console.error("[API -> Modbus] 寫入 Modbus 失敗:", err.message);
        res.status(500).json({ error: "寫入 Modbus 設備失敗", details: err.message });
    } finally {
        console.log(`--------------------------------------------------`);
    }
});
// ★★★ 用來接收「溫度調整指令」的 POST API ★★★
app.post('/api/ac/:floor/:id/temperature', async (req, res) => {
    const { floor, id } = req.params;
    const { temperature } = req.body;
    
    const unit = acData[floor]?.find(u => u.id === id);
    if (!unit) {
        return res.status(404).json({ error: `AC unit not found.` });
    }

    try {
        const isConnected = await ensureModbusConnection();
        if (!isConnected) {
            throw new Error("無法連接到 Modbus 設備。");
        }

        // ★ 修正：根據CSV配置計算正確的溫度寫入地址
        const tempWriteAddress = 22 + (unit.modbusAddress * 2);
        const valueToWrite = Math.round(temperature * 10); // 乘以 10 轉換為整數
        
        console.log(`[溫度調整] ${unit.locationName} -> ${temperature}°C (地址: ${tempWriteAddress}, 值: ${valueToWrite})`);
        
        client.setID(modbusSlaveId);
        await client.writeRegister(tempWriteAddress, valueToWrite);
        console.log(`[溫度調整] ✓ 溫度設定指令已成功發送到設備！(地址: ${tempWriteAddress}, 值: ${valueToWrite})`);
        
        unit.setTemperature = temperature;
        res.status(200).json(unit);

    } catch (err) {
        console.error("[API -> Modbus] 寫入溫度失敗:", err.message);
        res.status(500).json({ error: "寫入 Modbus 設備失敗", details: err.message });
    }
});
// ★★★ 用來接收「風速調整指令」的 POST API ★★★
app.post('/api/ac/:floor/:id/fanspeed', (req, res) => {
    const { floor, id } = req.params;
    const { fanSpeed } = req.body;
    
    if (!acData[floor]) {
        return res.status(404).json({ error: `Floor ${floor} not found.` });
    }

    const unit = acData[floor].find(u => u.id === id);

    if (unit) {
        const validSpeeds = ["自動", "弱", "中", "強"];
        if (validSpeeds.includes(fanSpeed)) {
            unit.fanSpeed = fanSpeed;
            console.log(`空調風速已手動設定: ${floor} - ${unit.locationName} 的風速為 ${unit.fanSpeed}`);
            res.status(200).json(unit);
        } else {
            res.status(400).json({ error: `Invalid fan speed: ${fanSpeed}` });
        }
    } else {
        res.status(404).json({ error: `AC unit with id ${id} not found on floor ${floor}.` });
    }
});
// ★★★ 用來接收「風向調整指令」的 POST API ★★★
app.post('/api/ac/:floor/:id/swing', (req, res) => {
    const { floor, id } = req.params;
    const { type, value } = req.body;
    
    if (!acData[floor]) {
        return res.status(404).json({ error: `Floor ${floor} not found.` });
    }

    const unit = acData[floor].find(u => u.id === id);

    if (unit) {
        if (type === 'vertical') {
            unit.verticalSwing = value;
        } else if (type === 'horizontal') {
            unit.horizontalSwing = value;
        } else {
            return res.status(400).json({ error: `Invalid swing type: ${type}` });
        }
        console.log(`空調風向已手動設定: ${floor} - ${unit.locationName} 的 ${type} 風向為 ${value}`);
        res.status(200).json(unit);
    } else {
        res.status(404).json({ error: `AC unit with id ${id} not found on floor ${floor}.` });
    }
});

const server = http.createServer(app);

// --- 啟動伺服器 ---
if (httpsOptions) {
    const server = https.createServer(httpsOptions, app);
    server.listen(PORT, () => {
        console.log(`後端 HTTPS 伺服器正在 https://localhost:${PORT} 運行`);
        console.log(`允許來自 https://workkkkkkez00m.github.io 的跨域請求`);
    });
    
} else {
    // 如果在本地端找不到憑證，就用不安全的 HTTP 模式啟動，方便除錯
    app.listen(PORT, () => {
        console.log(`後端 HTTP 伺服器正在 http://localhost:${PORT} 運行`);
    });
}