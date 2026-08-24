import { data } from "react-router";

import type { Route } from "./+types/profile-action";
import { assertSameOrigin, requireOwner } from "../lib/auth.server";
import { updateOwnerProfile } from "../lib/profile.server";

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const owner = await requireOwner(request);
  const result = await updateOwnerProfile(await request.formData(), owner.id);
  return data(result, { status: result.ok ? 200 : 400 });
}
