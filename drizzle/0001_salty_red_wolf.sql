ALTER TABLE "short_urls" ADD COLUMN "management_password_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "short_urls" ADD COLUMN "note" varchar(240);--> statement-breakpoint
ALTER TABLE "short_urls" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "short_urls" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "short_urls" SET "updated_at" = "created_at";--> statement-breakpoint
ALTER TABLE "short_urls" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "short_urls" ALTER COLUMN "updated_at" SET NOT NULL;
