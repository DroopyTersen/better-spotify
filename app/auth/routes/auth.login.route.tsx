import { ActionFunctionArgs, useNavigation } from "react-router";
import { authenticator } from "../auth.server";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
} from "~/shadcn/components/ui/card";

export const action = ({ request }: ActionFunctionArgs) => {
  return authenticator.authenticate("spotify", request);
};

export default function Login() {
  let navigation = useNavigation();
  let isLoading = navigation.state !== "idle";
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-400 to-blue-500">
      <Card className="max-w-lg w-full mx-auto">
        <CardHeader>
          <CardTitle>Better Spotify</CardTitle>
          <CardDescription>Enhance your music experience</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/login" method="post" className="mt-8">
            <button
              disabled={isLoading}
              className="w-full bg-[#1DB954] hover:bg-[#1ed760] text-white text-lg py-3 px-4 rounded-full font-semibold transition duration-300 flex items-center justify-center"
            >
              {isLoading ? (
                <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              ) : (
                <img
                  src="/spotify-logo.svg"
                  alt="Spotify"
                  className="w-6 h-6 mr-2"
                />
              )}
              {isLoading ? "Connecting..." : "Login with Spotify"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
