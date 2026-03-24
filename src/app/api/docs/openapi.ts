/**
 * OpenAPI 3.0 specification for easyRecharge API.
 */

const SITE_URL = process.env.SITE_URL || "https://easyrecharge.ch";

export function getOpenApiSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "easyRecharge API",
      description:
        "Internal API for the easyRecharge Next.js application. Handles form submissions, CMS asset proxying, locality search, and Directus webhook revalidation.",
      version: "2.0.0",
    },
    servers: [{ url: "", description: "Current server" }],
    paths: {
      "/api/quote": {
        post: {
          tags: ["Forms"],
          summary: "Submit a quote request",
          description:
            "Creates a form session, user, and submission in Directus, then fires a webhook with the full payload.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/QuoteRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Quote submitted successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      submissionId: {
                        type: "string",
                        format: "uuid",
                        example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                      },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Missing required fields",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            "500": {
              description: "Server error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      "/api/contact": {
        post: {
          tags: ["Forms"],
          summary: "Submit a contact form",
          description:
            "Creates a form session, user, and submission in Directus, then fires a webhook.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ContactRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Contact form submitted",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      message: { type: "string", example: "Message recu avec succes" },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Missing required fields",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            "500": {
              description: "Server error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },

      "/api/form-submissions/{id}": {
        get: {
          tags: ["Forms"],
          summary: "Get a form submission by ID",
          description:
            "Retrieves a stored form submission. Used by the QuoteSuccess page to display confirmation details.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
              description: "Submission UUID",
            },
          ],
          responses: {
            "200": {
              description: "Submission found",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: { type: "object", description: "Full submission record" },
                    },
                  },
                },
              },
            },
            "404": {
              description: "Submission not found",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: false },
                    },
                  },
                },
              },
            },
          },
        },
      },

      "/api/cms/localities": {
        get: {
          tags: ["CMS"],
          summary: "Search Swiss localities",
          description:
            "Searches localities by name or postal code. Used by the address autocomplete in quote and contact forms.",
          parameters: [
            {
              name: "search",
              in: "query",
              required: true,
              schema: { type: "string", minLength: 2 },
              description: "Search term (min 2 characters)",
              example: "Lausanne",
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 8, maximum: 50 },
              description: "Max results to return (default 8, max 50)",
            },
            {
              name: "locale",
              in: "query",
              schema: { type: "string", default: "fr-FR" },
              description: "Directus locale code for canton name translations",
              example: "fr-FR",
            },
          ],
          responses: {
            "200": {
              description: "List of matching localities",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Locality" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },

      "/api/cms/assets/{id}": {
        get: {
          tags: ["CMS"],
          summary: "Proxy a Directus asset",
          description:
            "Proxies asset files from Directus, forwarding the auth token. Supports image transforms via query parameters. Returns immutable cache headers (1 year).",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
              description: "Directus asset UUID",
            },
            {
              name: "width",
              in: "query",
              schema: { type: "integer" },
              description: "Resize width (pixels)",
            },
            {
              name: "height",
              in: "query",
              schema: { type: "integer" },
              description: "Resize height (pixels)",
            },
          ],
          responses: {
            "200": {
              description: "Asset file (image, PDF, etc.)",
              content: {
                "image/*": {
                  schema: { type: "string", format: "binary" },
                },
              },
            },
            "404": { description: "Asset not found in Directus" },
            "502": { description: "Directus upstream error" },
          },
        },
      },

      "/api/webhooks/directus": {
        post: {
          tags: ["Webhooks"],
          summary: "Directus content revalidation webhook",
          description:
            "Receives Directus webhook events on content changes and triggers Next.js ISR revalidation for affected pages. Authenticated via x-webhook-secret header.",
          security: [{ webhookSecret: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DirectusWebhookPayload" },
              },
            },
          },
          responses: {
            "200": {
              description: "Revalidation triggered",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      revalidated: { type: "integer", example: 2 },
                      tags: {
                        type: "array",
                        items: { type: "string" },
                        example: ["blog-posts", "blog-post-my-post"],
                      },
                    },
                  },
                },
              },
            },
            "401": { description: "Invalid or missing webhook secret" },
            "400": { description: "Missing collection in payload" },
          },
        },
      },

      "/api/docs": {
        get: {
          tags: ["Documentation"],
          summary: "OpenAPI specification (JSON)",
          description: "Returns this OpenAPI 3.0 specification as JSON.",
          responses: {
            "200": {
              description: "OpenAPI spec",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },

      "/api/debug/urls": {
        get: {
          tags: ["Debug"],
          summary: "List all generated URLs",
          description:
            "Returns all URLs from the sitemap registries (CMS pages, blog posts, vehicles/brands). Useful for debugging URL generation and verifying sitemap coverage.",
          parameters: [
            {
              name: "type",
              in: "query",
              schema: {
                type: "string",
                enum: ["cms", "blog", "vehicles", "all"],
                default: "all",
              },
              description: "Filter by URL type",
            },
            {
              name: "lang",
              in: "query",
              schema: { type: "string", enum: ["fr", "de"] },
              description: "Filter by language",
            },
          ],
          responses: {
            "200": {
              description: "URL list with summary",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      summary: {
                        type: "object",
                        additionalProperties: {
                          type: "object",
                          properties: {
                            total: { type: "integer" },
                            fr: { type: "integer" },
                            de: { type: "integer" },
                          },
                        },
                        example: {
                          cms: { total: 24, fr: 12, de: 12 },
                          blog: { total: 16, fr: 8, de: 8 },
                          vehicles: { total: 120, fr: 60, de: 60 },
                        },
                      },
                      totalUrls: { type: "integer", example: 160 },
                      urls: {
                        type: "array",
                        items: { type: "string" },
                        example: ["/fr", "/de", "/fr/blog", "/fr/vehicules"],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },

      "/sitemap.xml": {
        get: {
          tags: ["SEO"],
          summary: "XML Sitemap",
          description:
            "Dynamic sitemap generated from CMS pages, blog posts, and vehicle pages. Includes hreflang alternates for fr/de. Generated by Next.js MetadataRoute.",
          responses: {
            "200": {
              description: "Sitemap XML",
              content: { "application/xml": { schema: { type: "string" } } },
            },
          },
        },
      },

      "/robots.txt": {
        get: {
          tags: ["SEO"],
          summary: "Robots.txt",
          description:
            "Allows all crawlers, disallows /api/. Points to /sitemap.xml.",
          responses: {
            "200": {
              description: "Robots.txt content",
              content: { "text/plain": { schema: { type: "string" } } },
            },
          },
        },
      },
    },

    components: {
      securitySchemes: {
        webhookSecret: {
          type: "apiKey",
          in: "header",
          name: "x-webhook-secret",
          description: "Directus webhook secret (DIRECTUS_WEBHOOK_SECRET env var)",
        },
      },
      schemas: {
        QuoteRequest: {
          type: "object",
          required: ["firstName", "lastName", "email"],
          properties: {
            firstName: { type: "string", example: "Jean" },
            lastName: { type: "string", example: "Dupont" },
            email: { type: "string", format: "email", example: "jean@example.ch" },
            phone: { type: "string", example: "+41791234567" },
            phoneCountry: { type: "string", example: "CH" },
            housingStatus: { type: "string", enum: ["owner", "tenant"] },
            housingType: { type: "string" },
            solarEquipment: { type: "string" },
            homeBattery: { type: "string" },
            parkingSpotLocation: { type: "string" },
            electricalLineDistance: { type: "number" },
            electricalLineHoleCount: { type: "number" },
            parkingSpotCount: { type: "number" },
            ecpProvided: { type: "string" },
            deadline: { type: "string" },
            vehicleStatus: { type: "string" },
            vehicleBrand: { type: "string" },
            vehicleModel: { type: "string" },
            vehicleTripDistance: { type: "number" },
            vehicleChargingHours: { type: "number" },
            canton: { type: "string", example: "VD" },
            postalCode: { type: "string", example: "1000" },
            locality: { type: "string", example: "Lausanne" },
            comment: { type: "string" },
            attribution: { type: "object", description: "UTM / ad click attribution data" },
            posthog: {
              type: "object",
              properties: {
                phDistinctId: { type: "string" },
                phSessionId: { type: "string" },
              },
            },
          },
        },

        ContactRequest: {
          type: "object",
          required: ["firstName", "lastName", "email", "message"],
          properties: {
            firstName: { type: "string", example: "Jean" },
            lastName: { type: "string", example: "Dupont" },
            email: { type: "string", format: "email", example: "jean@example.ch" },
            phone: { type: "string", example: "+41791234567" },
            phoneCountry: { type: "string", example: "CH" },
            message: { type: "string", example: "I'd like to learn more about your services." },
            company: { type: "string" },
            address: { type: "string" },
            streetName: { type: "string" },
            streetNb: { type: "string" },
            postalCode: { type: "string" },
            locality: { type: "string" },
            canton: { type: "string" },
            country: { type: "string" },
            subject: { type: "string" },
            attribution: { type: "object" },
          },
        },

        Locality: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string", example: "Lausanne" },
            postal_code: { type: "string", example: "1000" },
            additional_digit: { type: "string" },
            language: { type: "string", example: "fr" },
            canton_2l: { type: "string", example: "VD" },
            canton: {
              type: "object",
              properties: {
                translations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { name: { type: "string", example: "Vaud" } },
                  },
                },
              },
            },
          },
        },

        DirectusWebhookPayload: {
          type: "object",
          required: ["collection"],
          properties: {
            collection: {
              type: "string",
              enum: ["site_settings", "pages", "blog_posts", "vehicles", "vehicle_brands"],
              example: "blog_posts",
            },
            key: { type: "string", description: "Single item key" },
            keys: {
              type: "array",
              items: { type: "string" },
              description: "Multiple item keys",
            },
            payload: {
              type: "object",
              properties: {
                slug: { type: "string" },
              },
            },
          },
        },

        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string", example: "Missing required fields" },
          },
        },
      },
    },
  };
}
