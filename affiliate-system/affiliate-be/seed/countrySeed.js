const connectDB = require("../config/db");
const Country = require("../models/Country")
const { logger } = require("../middlewares/logger");

let countries = [
    {
        "id": 1,
        "name": "Andorra",
        "code": "AD"
    },
    {
        "id": 2,
        "name": "United Arab Emirates",
        "code": "AE"
    },
    {
        "id": 3,
        "name": "Afghanistan",
        "code": "AF"
    },
    {
        "id": 4,
        "name": "Antigua \u0026 Barbuda",
        "code": "AG"
    },
    {
        "id": 5,
        "name": "Anguilla",
        "code": "AI"
    },
    {
        "id": 6,
        "name": "Albania",
        "code": "AL"
    },
    {
        "id": 7,
        "name": "Armenia",
        "code": "AM"
    },
    {
        "id": 8,
        "name": "Netherland Antilles",
        "code": "AN"
    },
    {
        "id": 9,
        "name": "Angola",
        "code": "AO"
    },
    {
        "id": 10,
        "name": "Antartica",
        "code": "AQ"
    },
    {
        "id": 11,
        "name": "Argentina",
        "code": "AR"
    },
    {
        "id": 12,
        "name": "American Samoa",
        "code": "AS"
    },
    {
        "id": 13,
        "name": "Austria",
        "code": "AT"
    },
    {
        "id": 14,
        "name": "Australia",
        "code": "AU"
    },
    {
        "id": 15,
        "name": "Aruba",
        "code": "AQ"
    },
    {
        "id": 16,
        "name": "Azerbaijan",
        "code": "AZ"
    },
    {
        "id": 17,
        "name": "Bosnia-Herzegovina",
        "code": "BA"
    },
    {
        "id": 18,
        "name": "Barbados",
        "code": "BB"
    },
    {
        "id": 19,
        "name": "Bangladesh",
        "code": "BD"
    },
    {
        "id": 20,
        "name": "Belgium",
        "code": "BE"
    },
    {
        "id": 21,
        "name": "Burkina Faso",
        "code": "BF"
    },
    {
        "id": 22,
        "name": "Bulgaria",
        "code": "BG"
    },
    {
        "id": 23,
        "name": "Bahrain",
        "code": "BH"
    },
    {
        "id": 24,
        "name": "Burundi",
        "code": "BI"
    },
    {
        "id": 25,
        "name": "Benin",
        "code": "BJ"
    },
    {
        "id": 26,
        "name": "Bermuda",
        "code": "BM"
    },
    {
        "id": 27,
        "name": "Brunei Darussalam",
        "code": "BN"
    },
    {
        "id": 28,
        "name": "Bolivia",
        "code": "BO"
    },
    {
        "id": 29,
        "name": "Brazil",
        "code": "BR"
    },
    {
        "id": 30,
        "name": "Bahamas",
        "code": "BS"
    },
    {
        "id": 31,
        "name": "Bhutan",
        "code": "BT"
    },
    {
        "id": 32,
        "name": "Bouvet Island",
        "code": "BV"
    },
    {
        "id": 33,
        "name": "Botswana",
        "code": "BW"
    },
    {
        "id": 34,
        "name": "Belarus",
        "code": "BY"
    },
    {
        "id": 35,
        "name": "Belize",
        "code": "BZ"
    },
    {
        "id": 36,
        "name": "Canada",
        "code": "CA"
    },
    {
        "id": 37,
        "name": "Cocos Islands",
        "code": "CC"
    },
    {
        "id": 38,
        "name": "Central African Republic",
        "code": "CF"
    },
    {
        "id": 39,
        "name": "Congo",
        "code": "CG"
    },
    {
        "id": 40,
        "name": "Switzerland",
        "code": "CH"
    },
    {
        "id": 41,
        "name": "Ivory Coast",
        "code": "CI"
    },
    {
        "id": 42,
        "name": "Cook Islands",
        "code": "CK"
    },
    {
        "id": 43,
        "name": "Chile",
        "code": "CL"
    },
    {
        "id": 44,
        "name": "Camaroon",
        "code": "CM"
    },
    {
        "id": 45,
        "name": "China",
        "code": "CN"
    },
    {
        "id": 46,
        "name": "Columbia",
        "code": "CO"
    },
    {
        "id": 47,
        "name": "Costa Rica",
        "code": "CR"
    },
    {
        "id": 48,
        "name": "Cuba",
        "code": "CU"
    },
    {
        "id": 49,
        "name": "Cape Vedre",
        "code": "CV"
    },
    {
        "id": 50,
        "name": "Christmas Island",
        "code": "CX"
    },
    {
        "id": 51,
        "name": "Cyprus",
        "code": "CY"
    },
    {
        "id": 52,
        "name": "Czech Republic",
        "code": "CZ"
    },
    {
        "id": 53,
        "name": "Germany",
        "code": "DE"
    },
    {
        "id": 54,
        "name": "Djibouti",
        "code": "DJ"
    },
    {
        "id": 55,
        "name": "Denmark",
        "code": "DK"
    },
    {
        "id": 56,
        "name": "Dominica",
        "code": "DM"
    },
    {
        "id": 57,
        "name": "Dominican Republic",
        "code": "DO"
    },
    {
        "id": 58,
        "name": "Algeria",
        "code": "DZ"
    },
    {
        "id": 59,
        "name": "Ecuador",
        "code": "EC"
    },
    {
        "id": 60,
        "name": "Estonia",
        "code": "EE"
    },
    {
        "id": 61,
        "name": "Egypt",
        "code": "EG"
    },
    {
        "id": 62,
        "name": "Western Sahara",
        "code": "EH"
    },
    {
        "id": 63,
        "name": "Eritrea",
        "code": "ER"
    },
    {
        "id": 64,
        "name": "Spain",
        "code": "ES"
    },
    {
        "id": 65,
        "name": "Ethiopia",
        "code": "ET"
    },
    {
        "id": 66,
        "name": "Finland",
        "code": "FI"
    },
    {
        "id": 67,
        "name": "Fiji",
        "code": "FJ"
    },
    {
        "id": 68,
        "name": "Falkland Islands",
        "code": "FK"
    },
    {
        "id": 69,
        "name": "Micronesia",
        "code": "FM"
    },
    {
        "id": 70,
        "name": "Faroe Islands",
        "code": "FO"
    },
    {
        "id": 71,
        "name": "France",
        "code": "FR"
    },
    {
        "id": 72,
        "name": "Metropolitan France",
        "code": "FX"
    },
    {
        "id": 73,
        "name": "Gabon",
        "code": "GA"
    },
    {
        "id": 74,
        "name": "United Kingdom",
        "code": "GB"
    },
    {
        "id": 75,
        "name": "Grenada",
        "code": "GD"
    },
    {
        "id": 76,
        "name": "Georgia",
        "code": "GE"
    },
    {
        "id": 77,
        "name": "French Guiana",
        "code": "FG"
    },
    {
        "id": 78,
        "name": "Ghana",
        "code": "GH"
    },
    {
        "id": 79,
        "name": "Gibraltar",
        "code": "GI"
    },
    {
        "id": 80,
        "name": "Greenland",
        "code": "GL"
    },
    {
        "id": 81,
        "name": "Gambia",
        "code": "GM"
    },
    {
        "id": 82,
        "name": "Guinea",
        "code": "GN"
    },
    {
        "id": 83,
        "name": "Guadeloupe",
        "code": "GP"
    },
    {
        "id": 84,
        "name": "Equatorial Guinea",
        "code": "GQ"
    },
    {
        "id": 85,
        "name": "Greece",
        "code": "GR"
    },
    {
        "id": 86,
        "name": "South Georgia",
        "code": "GS"
    },
    {
        "id": 87,
        "name": "Guatemala",
        "code": "GT"
    },
    {
        "id": 88,
        "name": "Guam",
        "code": "GU"
    },
    {
        "id": 89,
        "name": "Guinea-Bissau",
        "code": "GW"
    },
    {
        "id": 90,
        "name": "Guyana",
        "code": "GY"
    },
    {
        "id": 100,
        "name": "Hong Kong",
        "code": "HK"
    },
    {
        "id": 101,
        "name": "Heard \u0026 McDonald Islands",
        "code": "HM"
    },
    {
        "id": 102,
        "name": "Honduras",
        "code": "HN"
    },
    {
        "id": 103,
        "name": "Croatia",
        "code": "HR"
    },
    {
        "id": 104,
        "name": "Haiti",
        "code": "HT"
    },
    {
        "id": 105,
        "name": "Hungary",
        "code": "HU"
    },
    {
        "id": 106,
        "name": "Indonesia",
        "code": "ID"
    },
    {
        "id": 107,
        "name": "Ireland",
        "code": "IE"
    },
    {
        "id": 108,
        "name": "Israel",
        "code": "IL"
    },
    {
        "id": 109,
        "name": "India",
        "code": "IN"
    },
    {
        "id": 110,
        "name": "British Indian Ocean Territory",
        "code": "IO"
    },
    {
        "id": 111,
        "name": "Iraq",
        "code": "IQ"
    },
    {
        "id": 112,
        "name": "Iran",
        "code": "IR"
    },
    {
        "id": 113,
        "name": "Iceland",
        "code": "IS"
    },
    {
        "id": 114,
        "name": "Italy",
        "code": "IT"
    },
    {
        "id": 115,
        "name": "Jamaica",
        "code": "JM"
    },
    {
        "id": 116,
        "name": "Jordan",
        "code": "JO"
    },
    {
        "id": 117,
        "name": "Japan",
        "code": "JP"
    },
    {
        "id": 118,
        "name": "Kenya",
        "code": "KE"
    },
    {
        "id": 119,
        "name": "Kyrgyzstan",
        "code": "KG"
    },
    {
        "id": 120,
        "name": "Cambodia",
        "code": "KH"
    },
    {
        "id": 121,
        "name": "Kiribati",
        "code": "KI"
    },
    {
        "id": 122,
        "name": "Comoros",
        "code": "KM"
    },
    {
        "id": 123,
        "name": "St Kitts and Nevis",
        "code": "KN"
    },
    {
        "id": 124,
        "name": "Democratic Peoples Republic of Korea",
        "code": "KP"
    },
    {
        "id": 125,
        "name": "Republic of Korea",
        "code": "KR"
    },
    {
        "id": 126,
        "name": "Kuwait",
        "code": "KW"
    },
    {
        "id": 127,
        "name": "Cayman Islands",
        "code": "KY"
    },
    {
        "id": 128,
        "name": "Kazakhstan",
        "code": "KZ"
    },
    {
        "id": 129,
        "name": "Laos",
        "code": "LA"
    },
    {
        "id": 130,
        "name": "Lebanon",
        "code": "LB"
    },
    {
        "id": 131,
        "name": "Saint Lucia",
        "code": "LC"
    },
    {
        "id": 132,
        "name": "Liechtenstein",
        "code": "LI"
    },
    {
        "id": 133,
        "name": "Sri Lanka",
        "code": "LK"
    },
    {
        "id": 134,
        "name": "Liberia",
        "code": "LR"
    },
    {
        "id": 135,
        "name": "Lesotho",
        "code": "LS"
    },
    {
        "id": 136,
        "name": "Lithuania",
        "code": "LT"
    },
    {
        "id": 137,
        "name": "Luxembourg",
        "code": "LU"
    },
    {
        "id": 138,
        "name": "Latvia",
        "code": "LV"
    },
    {
        "id": 139,
        "name": "Libya",
        "code": "LY"
    },
    {
        "id": 140,
        "name": "Morocco",
        "code": "MA"
    },
    {
        "id": 141,
        "name": "Monaco",
        "code": "MC"
    },
    {
        "id": 142,
        "name": "Moldova",
        "code": "MD"
    },
    {
        "id": 143,
        "name": "Madagasca",
        "code": "MG"
    },
    {
        "id": 144,
        "name": "Marshall Islands",
        "code": "MH"
    },
    {
        "id": 145,
        "name": "Mali",
        "code": "ML"
    },
    {
        "id": 146,
        "name": "Mongolia",
        "code": "MN"
    },
    {
        "id": 147,
        "name": "Myanmar",
        "code": "MM"
    },
    {
        "id": 148,
        "name": "Macedonia",
        "code": "MK"
    },
    {
        "id": 149,
        "name": "Macau",
        "code": "MO"
    },
    {
        "id": 150,
        "name": "Northern Mariana Islands",
        "code": "MP"
    },
    {
        "id": 151,
        "name": "Martinique",
        "code": "MQ"
    },
    {
        "id": 152,
        "name": "Mauritania",
        "code": "MR"
    },
    {
        "id": 153,
        "name": "Monserrat",
        "code": "MS"
    },
    {
        "id": 154,
        "name": "Malta",
        "code": "MT"
    },
    {
        "id": 155,
        "name": "Mauritius",
        "code": "MU"
    },
    {
        "id": 156,
        "name": "Maldives",
        "code": "MV"
    },
    {
        "id": 157,
        "name": "Malawi",
        "code": "MW"
    },
    {
        "id": 158,
        "name": "Mexico",
        "code": "MX"
    },
    {
        "id": 159,
        "name": "Malaysia",
        "code": "MY"
    },
    {
        "id": 160,
        "name": "Mozambique",
        "code": "MZ"
    },
    {
        "id": 161,
        "name": "Nambia",
        "code": "NA"
    },
    {
        "id": 162,
        "name": "New Caledonia",
        "code": "NC"
    },
    {
        "id": 163,
        "name": "Niger",
        "code": "NE"
    },
    {
        "id": 164,
        "name": "Norfolk Islands",
        "code": "NF"
    },
    {
        "id": 165,
        "name": "Nigeria",
        "code": "NG"
    },
    {
        "id": 166,
        "name": "Nicaragua",
        "code": "NI"
    },
    {
        "id": 167,
        "name": "The Netherlands",
        "code": "NL"
    },
    {
        "id": 168,
        "name": "Norway",
        "code": "NO"
    },
    {
        "id": 169,
        "name": "Nepal",
        "code": "NP"
    },
    {
        "id": 170,
        "name": "Nauru",
        "code": "NR"
    },
    {
        "id": 171,
        "name": "Nieu",
        "code": "NU"
    },
    {
        "id": 172,
        "name": "New Zealand",
        "code": "NZ"
    },
    {
        "id": 173,
        "name": "Oman",
        "code": "OM"
    },
    {
        "id": 174,
        "name": "Panama",
        "code": "PA"
    },
    {
        "id": 175,
        "name": "Peru",
        "code": "PE"
    },
    {
        "id": 176,
        "name": "French Polynesia",
        "code": "PF"
    },
    {
        "id": 177,
        "name": "Papa New Guinea",
        "code": "PG"
    },
    {
        "id": 178,
        "name": "Philippines",
        "code": "PH"
    },
    {
        "id": 179,
        "name": "Pakistan",
        "code": "PK"
    },
    {
        "id": 180,
        "name": "Poland",
        "code": "PL"
    },
    {
        "id": 181,
        "name": "St Pierre and Miquelon",
        "code": "PM"
    },
    {
        "id": 182,
        "name": "Pitcarin",
        "code": "PN"
    },
    {
        "id": 183,
        "name": "Puerto Rico",
        "code": "PR"
    },
    {
        "id": 184,
        "name": "Portugal",
        "code": "PT"
    },
    {
        "id": 185,
        "name": "Palau",
        "code": "PW"
    },
    {
        "id": 186,
        "name": "Paraguay",
        "code": "PY"
    },
    {
        "id": 187,
        "name": "Qatar",
        "code": "QA"
    },
    {
        "id": 188,
        "name": "Reunion",
        "code": "RE"
    },
    {
        "id": 189,
        "name": "Romania",
        "code": "RO"
    },
    {
        "id": 190,
        "name": "Russia",
        "code": "RU"
    },
    {
        "id": 191,
        "name": "Rwanda",
        "code": "RW"
    },
    {
        "id": 192,
        "name": "Saudi Arabia",
        "code": "SA"
    },
    {
        "id": 193,
        "name": "Solomon Islands",
        "code": "SB"
    },
    {
        "id": 194,
        "name": "Seychelles",
        "code": "SC"
    },
    {
        "id": 195,
        "name": "Sudan",
        "code": "SD"
    },
    {
        "id": 196,
        "name": "Sweden",
        "code": "SE"
    },
    {
        "id": 197,
        "name": "Singapore",
        "code": "SG"
    },
    {
        "id": 198,
        "name": "St Helena",
        "code": "SH"
    },
    {
        "id": 199,
        "name": "Slovenia",
        "code": "SI"
    },
    {
        "id": 200,
        "name": "Svalbard and Jan Mayen Islands",
        "code": "SJ"
    },
    {
        "id": 201,
        "name": "Slovakia",
        "code": "SK"
    },
    {
        "id": 202,
        "name": "Sierra Leone",
        "code": "SL"
    },
    {
        "id": 203,
        "name": "San Marino",
        "code": "SM"
    },
    {
        "id": 204,
        "name": "Senegal",
        "code": "SN"
    },
    {
        "id": 205,
        "name": "Somalia",
        "code": "SO"
    },
    {
        "id": 206,
        "name": "Suriname",
        "code": "SR"
    },
    {
        "id": 207,
        "name": "Sao Tome \u0026 Principe",
        "code": "ST"
    },
    {
        "id": 208,
        "name": "El Salvador",
        "code": "SV"
    },
    {
        "id": 209,
        "name": "Syria",
        "code": "SY"
    },
    {
        "id": 210,
        "name": "Swaziland",
        "code": "SZ"
    },
    {
        "id": 211,
        "name": "Turks and Caicos Islands",
        "code": "TC"
    },
    {
        "id": 212,
        "name": "Chad",
        "code": "TD"
    },
    {
        "id": 213,
        "name": "French Southern Territories",
        "code": "TF"
    },
    {
        "id": 214,
        "name": "Togo",
        "code": "TG"
    },
    {
        "id": 215,
        "name": "Thailand",
        "code": "TH"
    },
    {
        "id": 216,
        "name": "Tajikistan",
        "code": "TJ"
    },
    {
        "id": 217,
        "name": "Tokelau",
        "code": "TK"
    },
    {
        "id": 218,
        "name": "Turkmenistan",
        "code": "TM"
    },
    {
        "id": 219,
        "name": "Tunisia",
        "code": "TN"
    },
    {
        "id": 220,
        "name": "Tonga",
        "code": "TO"
    },
    {
        "id": 221,
        "name": "East Timor",
        "code": "TP"
    },
    {
        "id": 222,
        "name": "Turkey",
        "code": "TR"
    },
    {
        "id": 223,
        "name": "Trinidad and Tobago",
        "code": "TT"
    },
    {
        "id": 224,
        "name": "Tuvalu",
        "code": "TV"
    },
    {
        "id": 225,
        "name": "Taiwan",
        "code": "TW"
    },
    {
        "id": 226,
        "name": "Tanzania",
        "code": "TZ"
    },
    {
        "id": 227,
        "name": "Ukraine",
        "code": "UA"
    },
    {
        "id": 228,
        "name": "Uganda",
        "code": "UG"
    },
    {
        "id": 229,
        "name": "United States Minor Outlying Islands",
        "code": "UM"
    },
    {
        "id": 230,
        "name": "United States",
        "code": "US"
    },
    {
        "id": 231,
        "name": "Uruguay",
        "code": "UY"
    },
    {
        "id": 232,
        "name": "Uzebekistan",
        "code": "UZ"
    },
    {
        "id": 233,
        "name": "Vatican City",
        "code": "VA"
    },
    {
        "id": 234,
        "name": "St Vincent \u0026 The Grenadines",
        "code": "VC"
    },
    {
        "id": 235,
        "name": "Venezuela",
        "code": "VE"
    },
    {
        "id": 236,
        "name": "British Virgin Islands",
        "code": "VG"
    },
    {
        "id": 237,
        "name": "US Virgin Islands",
        "code": "VI"
    },
    {
        "id": 238,
        "name": "Vietnam",
        "code": "VN"
    },
    {
        "id": 239,
        "name": "Vanuatu",
        "code": "VU"
    },
    {
        "id": 240,
        "name": "Wallis and Futuna Islands",
        "code": "WF"
    },
    {
        "id": 241,
        "name": "Samoa",
        "code": "WS"
    },
    {
        "id": 242,
        "name": "Yemen",
        "code": "YE"
    },
    {
        "id": 243,
        "name": "Mayotte",
        "code": "YT"
    },
    {
        "id": 244,
        "name": "Yugoslavia",
        "code": "YU"
    },
    {
        "id": 245,
        "name": "South Africa",
        "code": "ZA"
    },
    {
        "id": 246,
        "name": "Zambia",
        "code": "ZM"
    },
    {
        "id": 247,
        "name": "Zaire",
        "code": "ZR"
    },
    {
        "id": 248,
        "name": "Zimbabwe",
        "code": "ZW"
    }
]



countries = countries.map(country => {
    const { id, ...rest } = country;
    return rest;
});



connectDB();

//delete all countries
Country.deleteMany({})
    .then(() => {
        logger.info("seed.countries.delete_success");
    })
    .catch(err => {
        logger.error("seed.countries.delete_error", { error: err });
    });

Country.insertMany(countries)
    .then(() => {
        logger.info("seed.countries.insert_success");
    })
    .catch(err => {
        logger.error("seed.countries.insert_error", { error: err });
    });
