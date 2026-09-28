import Link from "next/link";
import { PageHeader } from "@/components/ui";

export default function NotFound() {
  return <PageHeader title="Record not found" description="It may have been removed, or the link is incomplete." actions={<Link href="/overview" className="btn-secondary">Go to overview</Link>} />;
}
