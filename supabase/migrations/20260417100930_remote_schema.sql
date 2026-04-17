
  create table "public"."community_item_tags" (
    "item_id" uuid not null,
    "tag_id" uuid not null
      );


alter table "public"."community_item_tags" enable row level security;


  create table "public"."community_tags" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."community_tags" enable row level security;

CREATE UNIQUE INDEX community_item_tags_pkey ON public.community_item_tags USING btree (item_id, tag_id);

CREATE UNIQUE INDEX community_tags_name_key ON public.community_tags USING btree (name);

CREATE UNIQUE INDEX community_tags_pkey ON public.community_tags USING btree (id);

CREATE INDEX idx_community_item_tags_item_id ON public.community_item_tags USING btree (item_id);

CREATE INDEX idx_community_item_tags_tag_id ON public.community_item_tags USING btree (tag_id);

alter table "public"."community_item_tags" add constraint "community_item_tags_pkey" PRIMARY KEY using index "community_item_tags_pkey";

alter table "public"."community_tags" add constraint "community_tags_pkey" PRIMARY KEY using index "community_tags_pkey";

alter table "public"."community_item_tags" add constraint "community_item_tags_item_id_fkey" FOREIGN KEY (item_id) REFERENCES public.community_items(id) ON DELETE CASCADE not valid;

alter table "public"."community_item_tags" validate constraint "community_item_tags_item_id_fkey";

alter table "public"."community_item_tags" add constraint "community_item_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES public.community_tags(id) ON DELETE CASCADE not valid;

alter table "public"."community_item_tags" validate constraint "community_item_tags_tag_id_fkey";

alter table "public"."community_tags" add constraint "community_tags_name_check" CHECK ((name ~ '^[a-z0-9][a-z0-9\-]{0,29}$'::text)) not valid;

alter table "public"."community_tags" validate constraint "community_tags_name_check";

alter table "public"."community_tags" add constraint "community_tags_name_key" UNIQUE using index "community_tags_name_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_max_tags_per_item()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF (SELECT count(*) FROM community_item_tags WHERE item_id = NEW.item_id) >= 5 THEN
    RAISE EXCEPTION 'Maximum 5 tags per item';
  END IF;
  RETURN NEW;
END;
$function$
;

grant delete on table "public"."community_item_tags" to "anon";

grant insert on table "public"."community_item_tags" to "anon";

grant references on table "public"."community_item_tags" to "anon";

grant select on table "public"."community_item_tags" to "anon";

grant trigger on table "public"."community_item_tags" to "anon";

grant truncate on table "public"."community_item_tags" to "anon";

grant update on table "public"."community_item_tags" to "anon";

grant delete on table "public"."community_item_tags" to "authenticated";

grant insert on table "public"."community_item_tags" to "authenticated";

grant references on table "public"."community_item_tags" to "authenticated";

grant select on table "public"."community_item_tags" to "authenticated";

grant trigger on table "public"."community_item_tags" to "authenticated";

grant truncate on table "public"."community_item_tags" to "authenticated";

grant update on table "public"."community_item_tags" to "authenticated";

grant delete on table "public"."community_item_tags" to "service_role";

grant insert on table "public"."community_item_tags" to "service_role";

grant references on table "public"."community_item_tags" to "service_role";

grant select on table "public"."community_item_tags" to "service_role";

grant trigger on table "public"."community_item_tags" to "service_role";

grant truncate on table "public"."community_item_tags" to "service_role";

grant update on table "public"."community_item_tags" to "service_role";

grant delete on table "public"."community_tags" to "anon";

grant insert on table "public"."community_tags" to "anon";

grant references on table "public"."community_tags" to "anon";

grant select on table "public"."community_tags" to "anon";

grant trigger on table "public"."community_tags" to "anon";

grant truncate on table "public"."community_tags" to "anon";

grant update on table "public"."community_tags" to "anon";

grant delete on table "public"."community_tags" to "authenticated";

grant insert on table "public"."community_tags" to "authenticated";

grant references on table "public"."community_tags" to "authenticated";

grant select on table "public"."community_tags" to "authenticated";

grant trigger on table "public"."community_tags" to "authenticated";

grant truncate on table "public"."community_tags" to "authenticated";

grant update on table "public"."community_tags" to "authenticated";

grant delete on table "public"."community_tags" to "service_role";

grant insert on table "public"."community_tags" to "service_role";

grant references on table "public"."community_tags" to "service_role";

grant select on table "public"."community_tags" to "service_role";

grant trigger on table "public"."community_tags" to "service_role";

grant truncate on table "public"."community_tags" to "service_role";

grant update on table "public"."community_tags" to "service_role";


  create policy "Item owner can add tags"
  on "public"."community_item_tags"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.community_items
  WHERE ((community_items.id = community_item_tags.item_id) AND (community_items.user_id = auth.uid())))));



  create policy "Item owner can remove tags"
  on "public"."community_item_tags"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.community_items
  WHERE ((community_items.id = community_item_tags.item_id) AND (community_items.user_id = auth.uid())))));



  create policy "Item tags are publicly readable"
  on "public"."community_item_tags"
  as permissive
  for select
  to public
using (true);



  create policy "Authenticated users can create tags"
  on "public"."community_tags"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "Tags are publicly readable"
  on "public"."community_tags"
  as permissive
  for select
  to public
using (true);


CREATE TRIGGER enforce_max_tags BEFORE INSERT ON public.community_item_tags FOR EACH ROW EXECUTE FUNCTION public.check_max_tags_per_item();


