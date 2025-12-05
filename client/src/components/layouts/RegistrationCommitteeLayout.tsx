import { Link, useLocation } from "wouter";
import { ClipboardList, Home, LogOut, UserPlus, Circle, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useWebSocket } from "@/contexts/WebSocketContext";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";

export default function RegistrationCommitteeLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { isConnected } = useWebSocket();
  const [open, setOpen] = useState(false);

  const isActive = (path: string) => location === path;

  const NavContent = () => (
    <nav className="space-y-2" data-testid="nav">
      <Link href="/registration-committee/dashboard">
        <Button
          variant={isActive("/registration-committee/dashboard") ? "default" : "ghost"}
          className="w-full justify-start"
          data-testid="link-dashboard"
          onClick={() => setOpen(false)}
        >
          <Home className="mr-2 h-4 w-4" />
          Dashboard
        </Button>
      </Link>

      <Link href="/registration-committee/registrations">
        <Button
          variant={isActive("/registration-committee/registrations") ? "default" : "ghost"}
          className="w-full justify-start"
          data-testid="link-registrations"
          onClick={() => setOpen(false)}
        >
          <ClipboardList className="mr-2 h-4 w-4" />
          Registrations
        </Button>
      </Link>

      <Link href="/registration-committee/on-spot-registration">
        <Button
          variant={isActive("/registration-committee/on-spot-registration") ? "default" : "ghost"}
          className="w-full justify-start"
          data-testid="link-on-spot-registration"
          onClick={() => setOpen(false)}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          On-Spot Registration
        </Button>
      </Link>
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row" data-testid="layout-registration-committee">
      {/* Mobile Header */}
      <header className="md:hidden bg-white border-b p-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-4 pt-10">
              <div className="mb-6">
                <h2 className="text-xl font-bold">Registration Committee</h2>
                <p className="text-sm text-muted-foreground">{user?.fullName}</p>
              </div>
              <NavContent />
              <div className="mt-auto pt-6 border-t mt-6">
                <Button variant="outline" className="w-full justify-start" onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <span className="font-semibold">Registration Committee</span>
        </div>
        {isConnected && (
          <Badge variant="outline">
            <Circle className="w-2 h-2 mr-1 fill-green-500 text-green-500" />
            Live
          </Badge>
        )}
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-muted/40 p-4 min-h-screen sticky top-0 h-screen" data-testid="sidebar">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold" data-testid="sidebar-title">Registration Committee</h2>
            {isConnected && (
              <Badge variant="outline" data-testid="badge-websocket-connected">
                <Circle className="w-2 h-2 mr-1 fill-green-500 text-green-500" />
                Live
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground" data-testid="sidebar-subtitle">
            {user?.fullName}
          </p>
        </div>

        <NavContent />

        <div className="mt-auto pt-6">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={logout}
            data-testid="button-logout"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-4 md:p-6" data-testid="main-content">
        {children}
      </main>
    </div>
  );
}
