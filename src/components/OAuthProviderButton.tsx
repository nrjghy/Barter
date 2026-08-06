import React from 'react';
import { Facebook, Apple } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';

interface OAuthProviderButtonProps {
  provider: 'google' | 'facebook' | 'apple';
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
}

// Google's official four-color "G" logo. Google's branding guidelines
// (developers.google.com/identity/branding-guidelines) require this exact
// standard-color logo on any custom sign-in button -- a monochrome
// stand-in (lucide's Chrome icon, used here previously) doesn't satisfy
// that and reads as visibly non-standard. Path/color data verified
// against react-icons' FcGoogle (Flat Color Icons), not hand-typed.
const GoogleLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path
      fill="#FFC107"
      d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12
      c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24
      c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
    />
    <path
      fill="#FF3D00"
      d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657
      C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36
      c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
    />
    <path
      fill="#1976D2"
      d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571
      c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
    />
  </svg>
);

const providerConfig = {
  google: {
    icon: GoogleLogo,
    label: 'Continue with Google',
    bgColor: 'bg-white hover:bg-gray-50',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-300',
    iconColor: ''
  },
  facebook: {
    icon: Facebook,
    label: 'Continue with Facebook',
    bgColor: 'bg-[#1877F2] hover:bg-[#166FE5]',
    textColor: 'text-white',
    borderColor: 'border-[#1877F2]',
    iconColor: 'text-white'
  },
  apple: {
    icon: Apple,
    label: 'Continue with Apple',
    bgColor: 'bg-black hover:bg-gray-900',
    textColor: 'text-white',
    borderColor: 'border-black',
    iconColor: 'text-white'
  }
};

export const OAuthProviderButton: React.FC<OAuthProviderButtonProps> = ({
  provider,
  onClick,
  loading,
  disabled
}) => {
  const config = providerConfig[provider];
  const Icon = config.icon;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center justify-center space-x-3 py-3 px-4 border rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${config.bgColor} ${config.textColor} ${config.borderColor}`}
    >
      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <Icon className={`w-5 h-5 ${config.iconColor}`} />
          <span className="font-medium">{config.label}</span>
        </>
      )}
    </button>
  );
};
