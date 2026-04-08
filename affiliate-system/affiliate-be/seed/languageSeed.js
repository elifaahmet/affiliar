const connectDB = require("../config/db");
const Language = require("../models/Language");
const { logger } = require("../middlewares/logger");

let languages = [
    {
        "id": 1,
        "name": "English",
        "code": "en"
    },
    {
        "id": 3,
        "name": "German",
        "code": "de"
    },
    {
        "id": 100001,
        "name": "French",
        "code": "fr"
    },
    {
        "id": 100002,
        "name": "Turkish",
        "code": "tr"
    },
    {
        "id": 100021,
        "name": "Italian",
        "code": "it"
    },
    {
        "id": 100041,
        "name": "Spanish",
        "code": "es"
    },
    {
        "id": 100042,
        "name": "Japanese",
        "code": "jp"
    },
    {
        "id": 100081,
        "name": "Swedish",
        "code": "se"
    },
    {
        "id": 100121,
        "name": "Russian",
        "code": "ru"
    },
    {
        "id": 100141,
        "name": "Chinese",
        "code": "ch"
    },
    {
        "id": 100161,
        "name": "Albanian",
        "code": "sq"
    },
    {
        "id": 100181,
        "name": "Polish",
        "code": "po"
    },
    {
        "id": 100182,
        "name": "Arabic",
        "code": "ar"
    },
    {
        "id": 100201,
        "name": "Ukrainian",
        "code": "uk"
    },
    {
        "id": 100202,
        "name": "Finnish",
        "code": "fi"
    },
    {
        "id": 100222,
        "name": "Norwegian",
        "code": "no"
    },
    {
        "id": 100242,
        "name": "Thai",
        "code": "th"
    },
    {
        "id": 100262,
        "name": "Hungarian",
        "code": "hu"
    }
];


languages = languages.map(language => {
    const { id, ...rest } = language;
    return rest;
}
);


connectDB();

//delete all languages
Language.deleteMany({})
    .then(() => {
        logger.info("seed.languages.deleted_success");
    })
    .catch(err => {
        logger.error("seed.languages.delete_error", { error: err });
    });



Language.insertMany(languages)
    .then(() => {
        logger.info("seed.languages.insert_success");
    })
    .catch(err => {
        logger.error("seed.languages.insert_error", { error: err });
    });
