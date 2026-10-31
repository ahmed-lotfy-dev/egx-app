CREATE TABLE "macro_quotes" (
	"key" text PRIMARY KEY NOT NULL,
	"value" numeric(18, 6),
	"change" numeric(18, 6),
	"change_pct" numeric(12, 4),
	"currency" text,
	"unit" text,
	"source" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
