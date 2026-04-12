


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."get_email_by_username"("p_username" "text") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT u.email
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE lower(p.username) = lower(p_username)
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_email_by_username"("p_username" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_download_count"("item_id_input" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE community_items
  SET downloads_count = downloads_count + 1
  WHERE id = item_id_input;
END;
$$;


ALTER FUNCTION "public"."increment_download_count"("item_id_input" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_item_rating"("item_id_input" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  avg_rating NUMERIC;
  rating_count INT;
BEGIN
  SELECT 
    COALESCE(AVG(rating), 0),
    COUNT(*) 
  INTO avg_rating, rating_count
  FROM community_ratings
  WHERE item_id = item_id_input;
  
  UPDATE community_items
  SET 
    average_rating = avg_rating,
    ratings_count = rating_count
  WHERE id = item_id_input;
END;
$$;


ALTER FUNCTION "public"."refresh_item_rating"("item_id_input" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_community_items_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_community_items_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."community_downloads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."community_downloads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "thumbnail_path" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_size_bytes" bigint NOT NULL,
    "downloads_count" integer DEFAULT 0 NOT NULL,
    "average_rating" numeric(3,2) DEFAULT 0 NOT NULL,
    "ratings_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plugin_uid" "text",
    "version" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_items_type_check" CHECK (("type" = ANY (ARRAY['template'::"text", 'plugin'::"text"])))
);


ALTER TABLE "public"."community_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_ratings_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."community_ratings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."community_downloads"
    ADD CONSTRAINT "community_downloads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_items"
    ADD CONSTRAINT "community_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_ratings"
    ADD CONSTRAINT "community_ratings_item_id_user_id_key" UNIQUE ("item_id", "user_id");



ALTER TABLE ONLY "public"."community_ratings"
    ADD CONSTRAINT "community_ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



CREATE INDEX "community_items_plugin_uid_idx" ON "public"."community_items" USING "btree" ("plugin_uid") WHERE ("plugin_uid" IS NOT NULL);



CREATE OR REPLACE TRIGGER "community_items_updated_at_trigger" BEFORE UPDATE ON "public"."community_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_community_items_updated_at"();



ALTER TABLE ONLY "public"."community_downloads"
    ADD CONSTRAINT "community_downloads_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."community_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_downloads"
    ADD CONSTRAINT "community_downloads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."community_items"
    ADD CONSTRAINT "community_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_ratings"
    ADD CONSTRAINT "community_ratings_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."community_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_ratings"
    ADD CONSTRAINT "community_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "authenticated users can create download records" ON "public"."community_downloads" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" IS NULL) OR (( SELECT "auth"."uid"() AS "uid") = "user_id")));



CREATE POLICY "community items are readable by anyone" ON "public"."community_items" FOR SELECT USING (true);



ALTER TABLE "public"."community_downloads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_ratings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "downloads readable by owner only if needed" ON "public"."community_downloads" FOR SELECT TO "authenticated" USING (false);



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_public_read" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "ratings readable by anyone" ON "public"."community_ratings" FOR SELECT USING (true);



CREATE POLICY "users can delete their own items" ON "public"."community_items" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "users can insert their own items" ON "public"."community_items" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "users can rate as themselves" ON "public"."community_ratings" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "users can update their own items" ON "public"."community_items" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "users can update their own rating" ON "public"."community_ratings" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."get_email_by_username"("p_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_email_by_username"("p_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_email_by_username"("p_username" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_download_count"("item_id_input" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_download_count"("item_id_input" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_download_count"("item_id_input" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_item_rating"("item_id_input" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_item_rating"("item_id_input" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_item_rating"("item_id_input" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_community_items_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_community_items_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_community_items_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."community_downloads" TO "anon";
GRANT ALL ON TABLE "public"."community_downloads" TO "authenticated";
GRANT ALL ON TABLE "public"."community_downloads" TO "service_role";



GRANT ALL ON TABLE "public"."community_items" TO "anon";
GRANT ALL ON TABLE "public"."community_items" TO "authenticated";
GRANT ALL ON TABLE "public"."community_items" TO "service_role";



GRANT ALL ON TABLE "public"."community_ratings" TO "anon";
GRANT ALL ON TABLE "public"."community_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."community_ratings" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "Authenticated users can read community files"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'community-files'::text));



  create policy "Authenticated users can upload files"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'community-files'::text));



  create policy "Authenticated users can upload thumbnails"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'community-thumbnails'::text));



  create policy "Thumbnails are publicly readable"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'community-thumbnails'::text));



  create policy "Users can upload to community files"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'community-files'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "community_files_auth_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'community-files'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "community_files_owner_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'community-files'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "community_files_public_read"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'community-files'::text));



