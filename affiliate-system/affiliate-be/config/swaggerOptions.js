const swaggerOptions = {
  // swagger-jsdoc v6+ expects `definition` (not `swaggerDefinition`)
  definition: {
    openapi: "3.0.0",
    info: {
      title: "PixupPlay Admin API",
      version: "1.0.0",
      description: "API Documentation for PixupPlay Admin project",
    },
    servers: [
      { url: "http://localhost:8081/api/" },
      { url: "https://admin.pixupplay.tech/api/" },
    ],
    // Apply global security at the OpenAPI root
    security: [{ BearerAuth: [] }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Provide the JWT token as: Bearer <token>. Obtain via /auth/login + /auth/verify-2fa.",
        },
      },
      schemas: {
        // Revenue: {
        //   type: "object",
        //   properties: {
        //     _id: {
        //       type: "string",
        //       description: "The auto-generated id of the revenue",
        //     },
        //     amount: {
        //       type: "number",
        //       description: "The amount of the revenue",
        //     },
        //     date: {
        //       type: "string",
        //       format: "date",
        //       description: "The date of the revenue",
        //     },
        //     isDeleted: {
        //       type: "boolean",
        //       description: "Soft delete flag",
        //     },
        //   },
        // },
        Country: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "The auto-generated id of the country",
            },
            name: {
              type: "string",
              description: "The name of the country",
            },
            code: {
              type: "string",
              description: "The code of the country",
            },
            isDeleted: {
              type: "boolean",
              description: "Soft delete flag",
            },
          },
        },
        Language: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "The auto-generated id of the language",
            },
            name: {
              type: "string",
              description: "The name of the language",
            },
            code: {
              type: "string",
              description: "The code of the language",
            },
            isDeleted: {
              type: "boolean",
              description: "Soft delete flag",
            },
          },
        },
        Currency: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "The auto-generated id of the currency",
            },
            name: {
              type: "string",
              description: "The name of the currency",
            },
            code: {
              type: "string",
              description: "The code of the currency",
            },
            symbol: {
              type: "string",
              description: "The symbol of the currency",
            },
            isDeleted: {
              type: "boolean",
              description: "Soft delete flag",
            },
          },
        },
        MarketingCode: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "The auto-generated id of the marketing code",
            },
            code: {
              type: "string",
              description: "The marketing code",
            },
            description: {
              type: "string",
              description: "The description of the marketing code",
            },
            isDeleted: {
              type: "boolean",
              description: "Soft delete flag",
            },
          },
        },
        Player: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "The auto generated id of the player",
            },
            id: {
              type: "number",
              description: "The auto generated id of the player",
            },
            username: {
              type: "string",
              description: "The username of the player",
            },
            email: {
              type: "string",
              description: "The email of the player",
            },
            lastLogin: {
              type: "string",
              description: "The last login of the player",
            },
            lastIP: {
              type: "string",
              description: "The last IP of the player",
            },

            name: {
              type: "string",
              description: "The name of the player",
            },
            surname: {
              type: "string",
              description: "The surname of the player",
            },
            ledger: {
              type: "object",
              properties: {
                _id: {
                  type: "string",
                  description: "The auto-generated id of the ledger",
                },
                currencyId: {
                  type: "string",
                  description: "The currency id of the ledger",
                },
                balance: {
                  type: "number",
                  description: "The balance of the ledger",
                },
                isDeleted: {
                  type: "boolean",
                  description: "Soft delete flag",
                },
              },
            },
          },
        },
        AffiliateUser: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The auto-generated id of the admin user",
              example: "60d0fe4f5311236168a109ca",
            },
            email: {
              type: "string",
              description: "The email of the admin user",
              example: "admin@example.com",
            },
            password: {
              type: "string",
              description: "The password of the admin user",
              example: "password123",
            },
          },
        },
        Auth: {
          type: "object",
          properties: {
            email: {
              type: "string",
              example: "user@example.com",
            },
            password: {
              type: "string",
              example: "password123",
            },
          },
        },
        Revenue: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The name of the revenue",
            },
            description: {
              type: "string",
              description: "The description of the revenue",
            },
            type: {
              type: "string",
              description: "The type of the revenue",
            },
          },
        },
        DepositTransaction: {
          type: "object",
          properties: {
            _id: {
              type: "string",
            },
            walletId: {
              type: "string",
            },
            amount: {
              type: "number",
            },
            transactionDate: {
              type: "string",
              format: "date-time",
            },
          },
        },
        WithdrawalTransaction: {
          type: "object",
          properties: {
            _id: {
              type: "string",
            },
            walletId: {
              type: "string",
            },
            amount: {
              type: "number",
            },
            transactionDate: {
              type: "string",
              format: "date-time",
            },
          },
        },
        Provider: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Custom numeric ID of the provider",
              example: 5017,
            },
            name: {
              type: "string",
              description: "Provider display name",
              example: "Push Gaming",
            },
            icon: {
              type: "string",
              description: "URL of the provider icon",
              example: "https://example.com/push-gaming.png",
            },
            restrictedAreas: {
              type: "array",
              items: { type: "string" },
              description: "List of country codes where provider is restricted",
            },
            isAllowed: {
              type: "boolean",
              description: "Whether the provider is active",
            },
            sort: {
              type: "number",
              description: "Sorting priority",
              example: 1,
            },
          },
        },

        SelectOption: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description: "Label for display in dropdown",
              example: "Push Gaming",
            },
            value: {
              type: "string",
              description: "Stringified ID for dropdown value",
              example: "5017",
            },
          },
        },
        Wallet: {
          type: "object",
          properties: {
            playerId: {
              type: "string",
              description: "The ID of the player",
            },
            walletCategory: {
              type: "string",
              description: "The category of the wallet",
              example: "Fiat",
            },
            currency: {
              type: "object",
              properties: {
                symbol: {
                  type: "string",
                  description: "The symbol of the currency",
                },
                shortCut: {
                  type: "string",
                  description: "The short cut of the currency",
                },
                fixedValueCount: {
                  type: "number",
                  description: "The fixed value count of the currency",
                },
              },
            },
            total: {
              type: "number",
              description: "The total amount in the wallet",
            },
            isDeleted: {
              type: "boolean",
              description: "Whether the wallet is deleted",
            },
          },
        },
        // Message: {
        //   type: "object",
        //   properties: {
        //     senderId: {
        //       type: "string",
        //       description: "The ID of the sender",
        //     },
        //     receiverId: {
        //       type: "string",
        //       description: "The ID of the receiver",
        //     },
        //     message: {
        //       type: "string",
        //       description: "The content of the message",
        //     },
        //     timestamp: {
        //       type: "string",
        //       format: "date-time",
        //       description: "The time when the message was created",
        //     },
        //     isDeleted: {
        //       type: "boolean",
        //       description: "Whether the message is deleted",
        //     },
        //   },
        // },
        Category: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "The auto-generated id of the category",
            },
            name: {
              type: "string",
              description: "The name of the category",
            },
            description: {
              type: "string",
              description: "The description of the category",
            },
            isDeleted: {
              type: "boolean",
              description: "Soft delete flag",
            },
            icon: {
              type: "string",
              description: "The icon of the category",
            },
            sort: {
              type: "number",
              description: "The sort of the category",
            },
            isAllowed: {
              type: "boolean",
              description: "The isAllowed of the category",
            },
          },
        },
        Notification: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Custom numeric ID of the notification",
            },
            date: {
              type: "string",
              format: "date-time",
              description: "Creation date of the notification",
            },
            branch: {
              type: "string",
              description: "Branch/source of the notification",
            },
            notificationDetails: {
              type: "string",
              description: "Details/content of the notification",
            },
            status: {
              type: "boolean",
              description: "Read status (false = Not Read, true = Read)",
            },
          },
          required: ["id", "date", "branch", "notificationDetails"],
        },
        PlayerNotification: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "MongoDB ObjectId of the player notification",
            },
            playerId: {
              type: "string",
              description: "Player ObjectId the notification belongs to",
            },
            title: {
              type: "string",
              description: "Optional title of the notification",
            },
            message: {
              type: "string",
              description: "Notification message body",
            },
            url: {
              type: "string",
              description: "Optional URL for navigation",
            },
            type: {
              type: "string",
              description: "Notification type",
              enum: ["info", "warning", "bonus", "alert"],
            },
            isRead: {
              type: "boolean",
              description: "Whether the notification is read",
            },
            readAt: {
              type: "string",
              format: "date-time",
              description: "Timestamp when notification was read",
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "Creation timestamp",
            },
          },
          required: ["playerId", "message"],
        },
        GameV2: {
          type: "object",
          properties: {
            _id: { type: "string", description: "Mongo ObjectId" },
            id: { type: "number", description: "Numeric game id" },
            game_code: { type: "string" },
            game_name: { type: "string" },
            provider: { type: "string" },
            providerId: { type: "string" },
            url_thumb: { type: "string" },
            admin_allowed: { type: "boolean" },
            deleted: { type: "integer", enum: [0, 1] },
            providerIsAllowed: { type: "boolean" },
            providerIsDeleted: { type: "boolean" },
            isVisible: { type: "boolean" },
            visibility: { type: "string", enum: ["Visible", "Not Visible"] },
            our_category: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  _id: { type: "string" },
                  name: { type: "string" },
                  isAllowed: { type: "boolean" },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: ["./routes/*.js"],
};

module.exports = swaggerOptions;
