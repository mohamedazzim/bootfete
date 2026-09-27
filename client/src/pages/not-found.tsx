import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900" data-testid="heading-not-found">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600" data-testid="text-message">
            The page you&apos;re looking for doesn&apos;t exist or was moved.
          </p>

          {/* "/" is the universal entry: logged-out visitors get the platform
              sign-in, logged-in users are bounced to their own dashboard. */}
          <Button asChild className="mt-6 w-full">
            <Link href="/" data-testid="button-back-to-signin">
              Back to sign in
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
