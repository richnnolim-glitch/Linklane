import { createFileRoute } from "@tanstack/react-router";
import { handleLink } from "@/lib/linklane/signaling.server";

const handle = ({ request }: { request: Request }) => handleLink(request);

export const Route = createFileRoute("/api/link")({
  server: { handlers: { GET: handle, POST: handle } },
});
