// update-password.js
// Usage: node update-password.js
// Requires .env with MONGO_URI (or paste the URI when prompted)

require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");
const bcrypt = require("bcrypt");
const prompts = require("prompts");

const SALT_ROUNDS = 12; // Adjust between 10–14 as needed

async function main() {
  try {
    const response = await prompts(
      [
        {
          type: "text",
          name: "mongoUri",
          message:
            "MongoDB connection URI (leave empty to use MONGO_URI from .env)",
          initial: process.env.MONGO_URI || "",
        },
        {
          type: "text",
          name: "dbName",
          message: "Database name",
          initial: "myDatabase",
        },
        {
          type: "text",
          name: "collection",
          message: "Collection name",
          initial: "users",
        },
        {
          type: "select",
          name: "filterBy",
          message: "Which field should be used to find the user?",
          choices: [
            { title: "email", value: "email" },
            { title: "_id (ObjectId string)", value: "_id" },
            { title: "username", value: "username" },
            { title: "custom field", value: "custom" },
          ],
          initial: 0,
        },
        {
          type: (prev) => (prev === "custom" ? "text" : null),
          name: "customField",
          message: "Enter custom field name (e.g., phone)",
        },
        {
          type: "text",
          name: "filterValue",
          message: (prev) =>
            prev === "_id"
              ? "Enter ObjectId string (e.g., 64a...)"
              : "Enter value to match",
        },
        {
          type: "password",
          name: "plainPassword",
          message: "New password (input hidden)",
        },
        {
          type: "confirm",
          name: "confirm",
          message: "Proceed to update the user password?",
          initial: true,
        },
      ],
      {
        onCancel: () => {
          console.log("\nAborted.");
          process.exit(1);
        },
      }
    );

    if (!response.confirm) {
      console.log("Operation cancelled.");
      process.exit(0);
    }

    const mongoUri =
      "mongodb://157.90.66.248:27019,157.90.66.248:27020/pixupplay-db?replicaSet=rsData";
    if (!mongoUri) {
      console.error(
        "Missing MongoDB URI. Add MONGO_URI to .env or input it when prompted."
      );
      process.exit(2);
    }

    const dbName = response.dbName;
    const collName = response.collection;
    const field =
      response.filterBy === "custom" ? response.customField : response.filterBy;

    if (!field) {
      console.error("Invalid field selection.");
      process.exit(3);
    }

    // Build filter
    let filter;
    if (field === "_id") {
      try {
        filter = { _id: new ObjectId(response.filterValue) };
      } catch (err) {
        console.error("Invalid ObjectId:", err.message);
        process.exit(4);
      }
    } else {
      filter = { [field]: response.filterValue };
    }

    const plain = response.plainPassword;
    if (!plain) {
      console.error("Password cannot be empty.");
      process.exit(5);
    }

    console.log("Hashing password...");
    const hash = await bcrypt.hash(plain, SALT_ROUNDS);

    console.log("Connecting to MongoDB...");
    const client = new MongoClient(mongoUri);
    await client.connect();

    const db = client.db(dbName);
    const coll = db.collection(collName);

    const update = {
      $set: {
        password: hash,
        passwordUpdatedAt: new Date(),
      },
    };

    const result = await coll.updateOne(filter, update);

    if (result.matchedCount === 0) {
      console.log("No matching user found. Filter:", JSON.stringify(filter));
    } else if (result.modifiedCount === 1) {
      console.log("Password updated successfully.");
    } else {
      console.log("Update result:", result);
    }

    await client.close();
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(6);
  }
}

main();
