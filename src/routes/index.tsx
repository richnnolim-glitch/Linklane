import { createFileRoute } from "@tanstack/react-router";
import { LinklaneApp } from "@/components/linklane/linklane-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <LinklaneApp />;
}
