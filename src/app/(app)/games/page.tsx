import { AppLayout } from "@/components/layout/AppLayout";
import GamesClient from "./GamesClient";

export const metadata = { title: "Games" };

export default function GamesPage() {
  return (
    <AppLayout>
      <GamesClient />
    </AppLayout>
  );
}
