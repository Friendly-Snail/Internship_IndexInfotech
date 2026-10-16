CREATE TABLE "resource_list_cache" (
	"resource" varchar(100) PRIMARY KEY NOT NULL,
	"cached_at" timestamp with time zone NOT NULL,
	CONSTRAINT "resource_list_cache_resource_check" CHECK ("resource_list_cache"."resource" IN ('type', 'region'))
);

