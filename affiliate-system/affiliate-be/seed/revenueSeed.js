const connectDB = require("../config/db");
const Revenue = require("../models/Revenue");
const { logger } = require("../middlewares/logger");

let revenues = [
    {
        "id": 1,
        "name": "Revenue - 40%",
        "description": "Affiliate Revenue Scheme at 40% of NGR",
        "type": "S"
    },
    {
        "id": 100001,
        "name": "Revenue - 50%",
        "description": "Affiliate Revenue Scheme at 50% of of NGR",
        "type": "S"
    },
    {
        "id": 100021,
        "name": "ClickThrough",
        "description": "Test Clickthrough Scheme",
        "type": "C"
    },
    {
        "id": 100022,
        "name": "CPA",
        "description": "CPA Scheme",
        "type": "R"
    },
    {
        "id": 100023,
        "name": "Revenue - 60%",
        "description": "Affiliate Revenue Scheme at 60% of of NGR",
        "type": "S"
    },
    {
        "id": 100024,
        "name": "Revenue - 95%",
        "description": "Affiliate Revenue Scheme at 95% of of NGR",
        "type": "S"
    },
    {
        "id": 100043,
        "name": "GEP - 15%",
        "description": "Game Engine Provider Revenue Share Scheme - 15% of NGR",
        "type": "G"
    },
    {
        "id": 100044,
        "name": "GEP - 50%",
        "description": "Game Engine Provider Revenue Share Scheme - 50% of NGR",
        "type": "G"
    },
    {
        "id": 100045,
        "name": "GEP - 10%",
        "description": "Game Engine Provider Revenue Share Scheme - 10% of NGR",
        "type": "G"
    },
    {
        "id": 100046,
        "name": "GEP - 20%",
        "description": "Game Engine Provider Revenue Share Scheme - 20% of NGR",
        "type": "G"
    },
    {
        "id": 100103,
        "name": "Revenue - 90%",
        "description": "Affiliate Revenue Scheme at 90% of of NGR",
        "type": "S"
    },
    {
        "id": 100123,
        "name": "GEP Affiliate RS",
        "description": "A Revenue Share Scheme for a Game Engine Provider\u0027s Affiliate Account - this does not pay anything out to the affiliate",
        "type": "A"
    },
    {
        "id": 100143,
        "name": "Revenue - 80%",
        "description": "Affiliate Revenue Scheme at 80% of of NGR",
        "type": "S"
    },
    {
        "id": 100163,
        "name": "Revenue - 25%",
        "description": "Affiliate Revenue Scheme at 25% of NGR",
        "type": "S"
    },
    {
        "id": 100183,
        "name": "Revenue - 15%",
        "description": "Affiliate Revenue Scheme at 15% of NGR",
        "type": "S"
    },
    {
        "id": 100184,
        "name": "Revenue - 20%",
        "description": "Affiliate Revenue Scheme at 20% of NGR",
        "type": "S"
    },
    {
        "id": 100185,
        "name": "Revenue - 30%",
        "description": "Affiliate Revenue Scheme at 30% of NGR",
        "type": "S"
    },
    {
        "id": 100186,
        "name": "Revenue - 35%",
        "description": "Affiliate Revenue Scheme at 35% of NGR",
        "type": "S"
    },
    {
        "id": 100187,
        "name": "Revenue - 45%",
        "description": "Affiliate Revenue Scheme at 40% of NGR",
        "type": "S"
    },
    {
        "id": 100203,
        "name": "Revenue - 70%",
        "description": "Affiliate Revenue Scheme at 70% of of NGR",
        "type": "S"
    },
    {
        "id": 100223,
        "name": "Revenue - 65%",
        "description": "Affiliate Revenue Scheme at 65% of of NGR",
        "type": "S"
    },
    {
        "id": 100243,
        "name": "PlayPhone Rev Scheme",
        "description": "Contractual revenue splits for PlayPhone Riches\r\n\u003cbr\u003e65% up £75k | 70% £75k-£150k | 75% above £150k",
        "type": "S"
    },
    {
        "id": 100263,
        "name": "Revenue - 0%",
        "description": "Affiliate Revenue Scheme at 0% of NGR",
        "type": "S"
    },
    {
        "id": 100264,
        "name": "GamePool Rev Split",
        "description": "Contractual revenue splits for GamePool Ltd.\r\n\u003cbr\u003e75% up €500k | 76% Over €500k | 77% Over €800k\r\n\u003cbr\u003e78% Over €1.2m | 79% Over €1.6m | 80% Over €2m",
        "type": "S"
    },
    {
        "id": 100265,
        "name": "Spin32 Affiliates €",
        "description": "EUR Spin32 Affiliates Revenue Scheme splits\r\n\u003cbr\u003e25% up to £10k | 30% £10k-£15k | 35% £15k-£20k | 40% over €20k",
        "type": "S"
    },
    {
        "id": 100266,
        "name": "Spin32 Affiliates £",
        "description": "GBP Spin32 Affiliates Revenue Scheme splits\r\n\u003cbr\u003e25% up to £10k | 30% £10k-£15k | 35% £15k-£20k | 40% over £20k",
        "type": "S"
    },
    {
        "id": 100283,
        "name": "Plus Five 100%",
        "description": "Revenue Scheme for Plus Five Only",
        "type": "S"
    },
    {
        "id": 100303,
        "name": "Lopoca Rev Scheme",
        "description": "Lopoca Revenue Share",
        "type": "S"
    },
    {
        "id": 100323,
        "name": "GEP - 12%",
        "description": "Game Engine Provider Revenue Share Scheme - 12% of NGR",
        "type": "G"
    },
    {
        "id": 100343,
        "name": "Revenue - 10%",
        "description": "Affiliate Revenue Scheme at 10% of NGR",
        "type": "S"
    },
    {
        "id": 100363,
        "name": "Shanti Rev Split",
        "description": "Contractual revenue splits for Shanti Capital Ltd \r\n\u003cbr\u003e80% up £50k | 85% £50k-£100k | 90% above £100k",
        "type": "S"
    },
    {
        "id": 100383,
        "name": "DEMO Rev Scheme",
        "description": "Contractual revenue splits for DEMO - 70%",
        "type": "S"
    },
    {
        "id": 100384,
        "name": "JLK Marketing Rev Scheme",
        "description": "Contractual revenue splits for JLK Marketing - 60%",
        "type": "S"
    },
    {
        "id": 100385,
        "name": "Optimum Value Rev Scheme",
        "description": "Contractual revenue splits for Optimum Value, LLC - 70%",
        "type": "S"
    },
    {
        "id": 100386,
        "name": "Justina Cruickshank Rev Scheme",
        "description": "Contractual revenue splits for BlushBomb - 60%",
        "type": "S"
    },
    {
        "id": 100403,
        "name": "Alchemy Bet Rev Scheme",
        "description": "Contractual Revenue Splits for Alchemy Bet - 65%",
        "type": "S"
    },
    {
        "id": 100423,
        "name": "Funtasia Rev Scheme",
        "description": "Contractual Revenue Splits for Funtasia - 70%\t",
        "type": "S"
    },
    {
        "id": 100443,
        "name": "Aberrant GEP -15% ",
        "description": "Aberrant Game Engine Provider Revenue Share Scheme - 15% of NGR",
        "type": "G"
    },
    {
        "id": 100463,
        "name": "test",
        "description": "",
        "type": "S"
    },
    {
        "id": 100483,
        "name": "Peter\u0027s Test",
        "description": "",
        "type": "S"
    },
    {
        "id": 100533,
        "name": "LuckyStreak Schemes",
        "description": "",
        "type": "S"
    },
    {
        "id": 100583,
        "name": "testing",
        "description": "",
        "type": "S"
    }
];


revenues = revenues.map(revenue => {
    const { id, ...rest } = revenue;
    return rest;
}
);

connectDB();

//delete all revenues
Revenue.deleteMany({})
    .then(() => {
        logger.info("seed.revenues.delete_success");
    })
    .catch(err => {
        logger.error("seed.revenues.delete_error", { error: err });
    });


Revenue.insertMany(revenues)
    .then(() => {
        logger.info("seed.revenues.insert_success");
    })
    .catch(err => {
        logger.error("seed.revenues.insert_error", { error: err });
    });
