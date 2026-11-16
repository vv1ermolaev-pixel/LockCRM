ALTER TABLE "contacts" ADD COLUMN "birth_day" smallint;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birth_month" smallint;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birth_year" smallint;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_birth_day_month_together" CHECK (("contacts"."birth_day" is null) = ("contacts"."birth_month" is null));--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_birth_year_needs_day_month" CHECK ("contacts"."birth_year" is null or "contacts"."birth_day" is not null);--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_birth_day_month_range" CHECK (("contacts"."birth_day" is null or "contacts"."birth_day" between 1 and 31) and ("contacts"."birth_month" is null or "contacts"."birth_month" between 1 and 12));