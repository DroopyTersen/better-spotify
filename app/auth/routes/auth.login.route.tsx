import { ActionFunctionArgs, useNavigation } from "react-router";
import { authenticator } from "../auth.server";

export const action = ({ request }: ActionFunctionArgs) => {
  return authenticator.authenticate("spotify", request);
};

export default function Login() {
  let navigation = useNavigation();
  let isLoading = navigation.state !== "idle";
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-400 to-blue-500 w-full">
      <div className="w-full bg-white bg-opacity-90 rounded-lg shadow-xl overflow-hidden max-w-lg mx-auto">
        <div className="p-8">
          <h1 className="text-4xl font-bold text-center text-gray-800 mb-2">
            Better Spotify
          </h1>
          <p className="text-center text-gray-600 mb-8">
            Enhance your music experience
          </p>
          <form action="/login" method="post">
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
                <svg
                  className="w-6 h-6 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                  />
                </svg>
              )}
              {isLoading ? "Connecting..." : "Login with Spotify"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
