import { DemoWorkspaceProvider } from "@/components/demo/DemoWorkspaceContext";
import { DemoChrome } from "@/components/demo/DemoChrome";

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoWorkspaceProvider>
      <DemoChrome>{children}</DemoChrome>
    </DemoWorkspaceProvider>
  );
}
