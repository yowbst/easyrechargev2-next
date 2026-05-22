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
        "Internal API for the easyRecharge Next.js application. Handles form submissions, partner dispatch resolution, CMS asset proxying, and locality search.",
      version: "2.1.0",
    },
    servers: [{ url: "", description: "Current server" }],
    paths: {
      "/api/quote": {
        post: {
          tags: ["Forms"],
          summary: "Submit a quote request",
          description:
            "Creates a form session, user, and submission in Directus. Resolves partner dispatch (when DISPATCH_MODE is set), records ledger rows in partner_dispatches, then fires the configured Make webhook with `submission.dispatch` populated.",
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

      "/api/mini-quote": {
        post: {
          tags: ["Forms"],
          summary: "Submit a mini-quote (housing + canton only)",
          description:
            "Lightweight intake form used by MiniQuoteCard / MiniQuoteForm islands. Persists a form_session + form_submission and returns the session token so a later full quote can be linked via `miniQuoteSessionToken`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MiniQuoteRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Mini-quote stored",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      sessionToken: { type: "string", format: "uuid" },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Missing housingStatus or postalCode",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
          },
        },
      },

      "/api/cms/localities/{id}/subsidies": {
        get: {
          tags: ["CMS"],
          summary: "Check if a locality offers a charging subsidy",
          description:
            "Lightweight lookup — only fetches the subsidies JSON. Returns `hasChargingSubsidy: true` when the locality has a `charging-infrastructure` subsidy for the `personal` audience.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer" },
              description: "Directus locality ID",
            },
            {
              name: "locale",
              in: "query",
              schema: { type: "string", default: "fr-FR" },
            },
          ],
          responses: {
            "200": {
              description: "Subsidy flag",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { hasChargingSubsidy: { type: "boolean" } },
                  },
                },
              },
            },
          },
        },
      },

      "/api/sitemap-index": {
        get: {
          tags: ["SEO"],
          summary: "Sitemap index (XML)",
          description:
            "XML sitemap index pointing to the per-segment sitemaps (cms, blog, vehicles, localities) at `/sitemap/{segment}.xml`.",
          responses: {
            "200": {
              description: "Sitemap index XML",
              content: { "application/xml": { schema: { type: "string" } } },
            },
          },
        },
      },

      "/api/debug/dispatches": {
        get: {
          tags: ["Debug"],
          summary: "Inspect partner_dispatches ledger",
          description:
            "Read-only view of recent partner dispatch records. Useful for spot-checking shadow vs. live behavior without opening Directus admin. Defaults to filtering by the current Vercel environment.",
          parameters: [
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 20, maximum: 200 },
              description: "Max rows to return (default 20, max 200).",
            },
            {
              name: "canton",
              in: "query",
              schema: { type: "string", example: "VD" },
              description: "Filter to a single 2-letter canton code.",
            },
            {
              name: "status",
              in: "query",
              schema: {
                type: "string",
                enum: ["dispatched", "skipped_quota", "skipped_test"],
              },
              description: "Filter by ledger status.",
            },
            {
              name: "partner",
              in: "query",
              schema: { type: "string", example: "eme-energies" },
              description: "Filter by partner slug.",
            },
            {
              name: "env",
              in: "query",
              schema: {
                type: "string",
                enum: ["development", "staging", "production", "all"],
              },
              description: "Environment filter. Defaults to the current deploy environment. Pass `all` to skip filtering.",
            },
          ],
          responses: {
            "200": {
              description: "Recent ledger rows",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      count: { type: "integer", example: 12 },
                      environment: { type: "string", example: "staging" },
                      rows: {
                        type: "array",
                        items: { $ref: "#/components/schemas/PartnerDispatch" },
                      },
                    },
                  },
                },
              },
            },
            "500": {
              description: "Failed to fetch from Directus",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
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
            lang: { type: "string", enum: ["fr", "de"], example: "fr" },
            acceptTerms: { type: "boolean" },
            miniQuoteSessionToken: { type: "string", format: "uuid", description: "When the user came from a MiniQuote, this links both submissions under the same session." },
            // Housing
            housingStatus: { type: "string", enum: ["owner", "tenant"] },
            housingType: { type: "string" },
            solarEquipment: { type: "string" },
            homeBattery: { type: "string" },
            neighborhoodEquipment: { type: "string" },
            electricalBoardType: { type: "string" },
            // Parking
            parkingSpotLocation: { type: "string" },
            electricalLineDistance: { type: "number" },
            electricalLineHoleCount: { type: "number" },
            // Charger
            parkingSpotCount: { type: "number" },
            ecpStatus: { type: "string", description: "Existing charging point status" },
            ecpBrand: { type: "string" },
            ecpModel: { type: "string" },
            ecpProvided: { type: "string" },
            deadline: { type: "string" },
            // Vehicle
            vehicleStatus: { type: "string" },
            vehicleBrand: { type: "string" },
            vehicleModel: { type: "string" },
            vehicleTripDistance: { type: "number" },
            vehicleChargingHours: { type: "number" },
            // Address
            addressMode: { type: "string", enum: ["google", "manual"] },
            address: { type: "string", description: "Full address when addressMode=google" },
            streetName: { type: "string", description: "When addressMode=manual" },
            streetNb: { type: "string", description: "When addressMode=manual" },
            postalCode: { type: "string", example: "1000" },
            locality: { type: "string", example: "Lausanne" },
            canton: {
              type: "string",
              example: "VD",
              description: "Accepts both 2-letter codes (`VD`) and localized names (`Vaud`, `Waadt`, `Valais`). Normalized to a 2-letter code server-side before persistence.",
            },
            country: { type: "string", example: "CH" },
            // Finalize
            approval: { type: "string" },
            comment: { type: "string" },
            attribution: {
              type: "object",
              description: "Ad-click / UTM attribution mirrored from server-set cookies (gclid, fbclid, msclkid, utm_*).",
              additionalProperties: { type: "string" },
            },
            posthog: {
              type: "object",
              properties: {
                phDistinctId: { type: "string" },
                phSessionId: { type: "string" },
              },
            },
          },
        },

        MiniQuoteRequest: {
          type: "object",
          required: ["housingStatus", "postalCode"],
          properties: {
            housingStatus: { type: "string", enum: ["owner", "tenant"] },
            postalCode: { type: "string", example: "1000" },
            locality: { type: "string", example: "Lausanne" },
            canton: { type: "string", example: "VD" },
            formType: { type: "string", example: "mini-quote-card" },
            pageId: { type: "string", description: "CMS route_id of the page where the mini-quote was submitted." },
            locale: { type: "string", example: "fr" },
            posthog: {
              type: "object",
              properties: {
                phDistinctId: { type: "string" },
                phSessionId: { type: "string" },
              },
            },
          },
        },

        DispatchBlock: {
          type: "object",
          description: "Outbound block on the Make webhook payload. Surfaces the dispatch decision so Make's Iterator can fan out partner emails and the Google Ads module can use the per-partner billable_rate.",
          properties: {
            mode: {
              type: "string",
              enum: ["off", "shadow", "live"],
              description: "Read from DISPATCH_MODE env var. `off` and `shadow` always send empty targets so Make's legacy path fires.",
            },
            canton: { type: "string", example: "VD", description: "Normalized 2-letter code." },
            isTest: {
              type: "boolean",
              description: "True when email matches `site_settings.global_config.dispatch.test_email_patterns` OR environment != production. Suppresses real dispatch.",
            },
            billableRate: {
              type: ["number", "null"],
              example: 0.5,
              description: "Max of `partner.billable_rate` across targets, fed into Google Ads `conversionValue = 40 × billableRate`. Null when targets is empty.",
            },
            summary: {
              type: "object",
              properties: {
                resolved: { type: "integer" },
                dispatched: { type: "integer" },
                skipped: { type: "integer" },
                reasons: { type: "array", items: { type: "string" }, example: ["exclusive_over_quota"] },
              },
            },
            targets: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  partnerSlug: { type: "string", example: "eme-energies" },
                  displayName: { type: "string", example: "E-ME Énergies", description: "Short display name (Directus `partners.name`)." },
                  email: { type: "string", format: "email" },
                  language: { type: "string", enum: ["fr", "de"] },
                  mode: { type: "string", enum: ["exclusive", "shared"] },
                  billableRate: { type: "number", example: 0.5 },
                  businessName: {
                    type: ["string", "null"],
                    example: "E-ME Énergies SA",
                    description: "Official legal name (Directus `partners.business_name`). May differ from `displayName`.",
                  },
                  legalForm: {
                    type: ["string", "null"],
                    enum: ["corporation", "llc", "gp", "sp", null],
                    description: "`corporation` = SA / AG, `llc` = Sàrl / GmbH, `gp` = General partnership / SNC, `sp` = Sole proprietorship.",
                  },
                  uid: {
                    type: ["string", "null"],
                    example: "CHE-392.813.544",
                    description: "Swiss business UID.",
                  },
                  address: {
                    type: "object",
                    description: "Partner HQ address. Always present; individual fields may be null when not set in Directus.",
                    properties: {
                      streetName: { type: ["string", "null"] },
                      streetNumber: { type: ["string", "null"] },
                      postalCode: { type: ["string", "null"], example: "1000" },
                      locality: { type: ["string", "null"], example: "Lausanne" },
                      canton: {
                        type: ["string", "null"],
                        example: "VD",
                        description: "2-letter code of the partner's HQ canton (different from the top-level `dispatch.canton`, which is the submission's canton).",
                      },
                    },
                  },
                },
              },
            },
          },
        },

        PartnerDispatch: {
          type: "object",
          description: "One row of the partner_dispatches ledger.",
          properties: {
            id: { type: "string", format: "uuid" },
            dispatched_at: { type: "string", format: "date-time" },
            status: {
              type: "string",
              enum: ["dispatched", "skipped_quota", "skipped_test"],
            },
            canton: { type: "string", example: "VD", description: "Snapshot of the 2-letter code at dispatch time." },
            mode_used: { type: "string", enum: ["exclusive", "shared"] },
            month_bucket: { type: "string", example: "2026-05", description: "YYYY-MM UTC — quota counting key." },
            environment: { type: "string", enum: ["development", "staging", "production"] },
            submission: { type: "string", format: "uuid" },
            partner: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                slug: { type: "string", example: "eme-energies" },
                name: { type: "string", example: "E-ME Énergies" },
                notification_email: { type: "string", format: "email" },
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
