const connectDB = require("../config/db");
const MarketingCode = require("../models/MarketingCode");
const { logger } = require("../middlewares/logger");

let marketingCodes = [
    {
        "id": 1,
        "affiliate_id": 1,
        "brand_id": 100001,
        "code": "ADM"
    },
    {
        "id": 2,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "STF"
    },
    {
        "id": 3,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "WEB"
    },
    {
        "id": 4,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "SMS"
    },
    {
        "id": 145,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "PARTNER"
    },
    {
        "id": 100141,
        "affiliate_id": 1,
        "brand_id": 100001,
        "code": "OTH"
    },
    {
        "id": 100201,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "P5G"
    },
    {
        "id": 100321,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "P5G-WEB"
    },
    {
        "id": 100342,
        "affiliate_id": 1,
        "brand_id": 100223,
        "code": "GSZ-WEB"
    },
    {
        "id": 100343,
        "affiliate_id": 1,
        "brand_id": 100223,
        "code": "GSZ-STF"
    },
    {
        "id": 100515,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "TESTING"
    },
    {
        "id": 100562,
        "affiliate_id": 1,
        "brand_id": 100283,
        "code": "IGA-HLT-WEB"
    },
    {
        "id": 100563,
        "affiliate_id": 1,
        "brand_id": 100283,
        "code": "IGA-HLT-STF"
    },
    {
        "id": 100702,
        "affiliate_id": 1,
        "brand_id": 100363,
        "code": "IGA-HLTV-WEB"
    },
    {
        "id": 100703,
        "affiliate_id": 1,
        "brand_id": 100363,
        "code": "IGA-HLTV-ADM"
    },
    {
        "id": 100704,
        "affiliate_id": 1,
        "brand_id": 100363,
        "code": "IGA-HLTV-STF"
    },
    {
        "id": 100742,
        "affiliate_id": 1,
        "brand_id": 100363,
        "code": "IGA1-WEB"
    },
    {
        "id": 100743,
        "affiliate_id": 1,
        "brand_id": 100363,
        "code": "IGA1-ADM"
    },
    {
        "id": 100744,
        "affiliate_id": 1,
        "brand_id": 100363,
        "code": "IGA1-STF"
    },
    {
        "id": 100745,
        "affiliate_id": 1,
        "brand_id": 100363,
        "code": "IGA2-WEB"
    },
    {
        "id": 100746,
        "affiliate_id": 1,
        "brand_id": 100363,
        "code": "IGA2-ADM"
    },
    {
        "id": 100747,
        "affiliate_id": 1,
        "brand_id": 100363,
        "code": "IGA2-STF"
    },
    {
        "id": 100763,
        "affiliate_id": 1,
        "brand_id": 100383,
        "code": "T5-LNC-ADM"
    },
    {
        "id": 100868,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "Centr-WEB"
    },
    {
        "id": 100869,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "Centr-ADM"
    },
    {
        "id": 100870,
        "affiliate_id": 1,
        "brand_id": 100603,
        "code": "Centr-STF"
    },
    {
        "id": 100902,
        "affiliate_id": 1,
        "brand_id": 100483,
        "code": "Centr-CNV-WEB"
    },
    {
        "id": 100903,
        "affiliate_id": 1,
        "brand_id": 100483,
        "code": "Centr-CNV-ADM"
    },
    {
        "id": 100904,
        "affiliate_id": 1,
        "brand_id": 100483,
        "code": "Centr-CNV-STF"
    },
    {
        "id": 100922,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "T5-P5G-WEB"
    },
    {
        "id": 100991,
        "affiliate_id": 1,
        "brand_id": 100525,
        "code": "LDI-WEB"
    },
    {
        "id": 100992,
        "affiliate_id": 1,
        "brand_id": 100525,
        "code": "LDI-ADM"
    },
    {
        "id": 100993,
        "affiliate_id": 1,
        "brand_id": 100525,
        "code": "LDI-STF"
    },
    {
        "id": 100994,
        "affiliate_id": 1,
        "brand_id": 100525,
        "code": "LDI-SSS-WEB"
    },
    {
        "id": 100995,
        "affiliate_id": 1,
        "brand_id": 100525,
        "code": "LDI-SSS-ADM"
    },
    {
        "id": 100996,
        "affiliate_id": 1,
        "brand_id": 100525,
        "code": "LDI-SSS-STF"
    },
    {
        "id": 101142,
        "affiliate_id": 1,
        "brand_id": 100603,
        "code": "T5-SBU-WEB"
    },
    {
        "id": 101143,
        "affiliate_id": 1,
        "brand_id": 100603,
        "code": "T5-SBU-ADM"
    },
    {
        "id": 101144,
        "affiliate_id": 1,
        "brand_id": 100603,
        "code": "T5-SBU-STF"
    },
    {
        "id": 101243,
        "affiliate_id": 1,
        "brand_id": 100623,
        "code": "T5-INF-ADM"
    },
    {
        "id": 101244,
        "affiliate_id": 1,
        "brand_id": 100623,
        "code": "T5-INF-STF"
    },
    {
        "id": 101283,
        "affiliate_id": 1,
        "brand_id": 100663,
        "code": "T5-REY8-ADM"
    },
    {
        "id": 101322,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "P5G-STF"
    },
    {
        "id": 101342,
        "affiliate_id": 1,
        "brand_id": 100623,
        "code": "INF-001"
    },
    {
        "id": 101343,
        "affiliate_id": 1,
        "brand_id": 100623,
        "code": "INF-002"
    },
    {
        "id": 101344,
        "affiliate_id": 1,
        "brand_id": 100623,
        "code": "INF-003"
    },
    {
        "id": 101382,
        "affiliate_id": 1,
        "brand_id": 100525,
        "code": "SSS-STF"
    },
    {
        "id": 101402,
        "affiliate_id": 1,
        "brand_id": 100623,
        "code": "INF-INF-WEB"
    },
    {
        "id": 101403,
        "affiliate_id": 1,
        "brand_id": 100623,
        "code": "INF-STF"
    },
    {
        "id": 101462,
        "affiliate_id": 1,
        "brand_id": 100623,
        "code": "PRB-INTRO"
    },
    {
        "id": 101582,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "P5G-JUNK"
    },
    {
        "id": 101882,
        "affiliate_id": 1,
        "brand_id": 100803,
        "code": "T5-P5M-WEB"
    },
    {
        "id": 101883,
        "affiliate_id": 1,
        "brand_id": 100803,
        "code": "T5-P5M-ADM"
    },
    {
        "id": 101884,
        "affiliate_id": 1,
        "brand_id": 100803,
        "code": "T5-P5M-STF"
    },
    {
        "id": 101902,
        "affiliate_id": 1,
        "brand_id": 100823,
        "code": "T5-IGT-WEB"
    },
    {
        "id": 101903,
        "affiliate_id": 1,
        "brand_id": 100823,
        "code": "T5-IGT-ADM"
    },
    {
        "id": 102142,
        "affiliate_id": 1,
        "brand_id": 100525,
        "code": "T5-SSS-WEB"
    },
    {
        "id": 102662,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "T5-BETITALIA"
    },
    {
        "id": 102663,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "T5-CUPPACASINO"
    },
    {
        "id": 102664,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "T5-SMILESLOTS"
    },
    {
        "id": 102665,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "T5-IBETNOW"
    },
    {
        "id": 102666,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "T5-HILTON"
    },
    {
        "id": 102667,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "T5-LONDONCASINO"
    },
    {
        "id": 102668,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "T5-PINKRIBBONBINGO"
    },
    {
        "id": 102669,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "T5-REY8"
    },
    {
        "id": 102670,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "T5-SPOOFSITE"
    },
    {
        "id": 102671,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "T5-WAGERANDPLAY"
    },
    {
        "id": 102682,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "T5-SHANTI"
    },
    {
        "id": 103344,
        "affiliate_id": 1,
        "brand_id": 101083,
        "code": "T5-NEX-WEB"
    },
    {
        "id": 103345,
        "affiliate_id": 1,
        "brand_id": 101083,
        "code": "T5-NEX-ADM"
    },
    {
        "id": 103346,
        "affiliate_id": 1,
        "brand_id": 101083,
        "code": "T5-NEX-STF"
    },
    {
        "id": 103362,
        "affiliate_id": 1,
        "brand_id": 100843,
        "code": "T5-MAF-WEB"
    },
    {
        "id": 103482,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "T5-P5G-WEB-STF"
    },
    {
        "id": 103562,
        "affiliate_id": 1,
        "brand_id": 101183,
        "code": "T5-SWB-WEB"
    },
    {
        "id": 103563,
        "affiliate_id": 1,
        "brand_id": 101183,
        "code": "T5-SWB-ADM"
    },
    {
        "id": 103564,
        "affiliate_id": 1,
        "brand_id": 101183,
        "code": "T5-SWB-STF"
    },
    {
        "id": 103662,
        "affiliate_id": 1,
        "brand_id": 101223,
        "code": "T5-WTK-WEB"
    },
    {
        "id": 103663,
        "affiliate_id": 1,
        "brand_id": 101223,
        "code": "T5-WTK-ADM"
    },
    {
        "id": 103664,
        "affiliate_id": 1,
        "brand_id": 101223,
        "code": "T5-WTK-STF"
    },
    {
        "id": 103943,
        "affiliate_id": 1,
        "brand_id": 101343,
        "code": "T5-NSK-WEB"
    },
    {
        "id": 103944,
        "affiliate_id": 1,
        "brand_id": 101343,
        "code": "T5-NSK-ADM"
    },
    {
        "id": 103945,
        "affiliate_id": 1,
        "brand_id": 101343,
        "code": "T5-NSK-STF"
    },
    {
        "id": 104642,
        "affiliate_id": 102283,
        "brand_id": 1,
        "code": "QTech-001"
    },
    {
        "id": 104842,
        "affiliate_id": 1,
        "brand_id": 101483,
        "code": "T5-ESP-WEB"
    },
    {
        "id": 104843,
        "affiliate_id": 1,
        "brand_id": 101483,
        "code": "T5-ESP-ADM"
    },
    {
        "id": 104844,
        "affiliate_id": 1,
        "brand_id": 101483,
        "code": "T5-ESP-STF"
    },
    {
        "id": 105248,
        "affiliate_id": 1,
        "brand_id": 101633,
        "code": "T5-EST-WEB"
    },
    {
        "id": 105249,
        "affiliate_id": 1,
        "brand_id": 101633,
        "code": "T5-EST-ADM"
    },
    {
        "id": 105250,
        "affiliate_id": 1,
        "brand_id": 101633,
        "code": "T5-EST-STF"
    },
    {
        "id": 105492,
        "affiliate_id": 1,
        "brand_id": 101683,
        "code": "T5-AOB-WEB"
    },
    {
        "id": 105493,
        "affiliate_id": 1,
        "brand_id": 101683,
        "code": "T5-AOB-ADM"
    },
    {
        "id": 105494,
        "affiliate_id": 1,
        "brand_id": 101683,
        "code": "T5-AOB-STF"
    },
    {
        "id": 106142,
        "affiliate_id": 103583,
        "brand_id": 1,
        "code": "1x2 N-001"
    },
    {
        "id": 106592,
        "affiliate_id": 1,
        "brand_id": 100525,
        "code": "T5-SPT-WEB"
    },
    {
        "id": 106942,
        "affiliate_id": 103983,
        "brand_id": 1,
        "code": "BYN-001"
    },
    {
        "id": 107042,
        "affiliate_id": 1,
        "brand_id": 100001,
        "code": "T5-OLG-WEB"
    },
    {
        "id": 107092,
        "affiliate_id": 1,
        "brand_id": 100001,
        "code": "T5-BARX-WEB"
    },
    {
        "id": 107242,
        "affiliate_id": 1,
        "brand_id": 1,
        "code": "T5-AQD-WEB"
    },
    {
        "id": 107246,
        "affiliate_id": 1,
        "brand_id": 102233,
        "code": "T5-AQES-WEB"
    },
    {
        "id": 107247,
        "affiliate_id": 1,
        "brand_id": 102233,
        "code": "T5-AQES-ADM"
    },
    {
        "id": 107248,
        "affiliate_id": 1,
        "brand_id": 102233,
        "code": "T5-AQES-STF"
    },
    {
        "id": 107542,
        "affiliate_id": 104333,
        "brand_id": 1,
        "code": "JoyPl-001"
    },
    {
        "id": 107642,
        "affiliate_id": 104433,
        "brand_id": 1,
        "code": "BARX-aliquantum99"
    },
    {
        "id": 107643,
        "affiliate_id": 104434,
        "brand_id": 100001,
        "code": "XBARX-test1234456"
    }
]

connectDB();

//delete All marketing codes
MarketingCode.deleteMany()
    .then(() => {
        logger.info("seed.marketing_codes.delete_success");
        //insert all marketing codes
    })
    .catch(error => {
        logger.error("seed.marketing_codes.delete_error", { error });
    });

//marketing code insertmany just code column
marketingCodes = marketingCodes.map(marketingCode => {
    const { id, affiliate_id, brand_id, ...rest } = marketingCode;
    return rest;
});


MarketingCode.insertMany(marketingCodes)
    .then(() => {
        logger.info("seed.marketing_codes.insert_success");
    })
    .catch(error => {
        logger.error("seed.marketing_codes.insert_error", { error });
    });
