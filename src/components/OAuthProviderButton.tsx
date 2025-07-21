import React from 'react';
import { Chrome, Facebook, Github } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';

interface OAuthProviderButtonProps {
  provider: 'google' | 'facebook' | 'github';
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
}

const providerConfig = {
  google: {
    icon: Chrome,
    label: 'Continue with Google',
    bgColor: 'bg-white hover:bg-gray-50',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-300',
    iconColor: 'text-gray-600'
  },
  facebook: {
    icon: Facebook,
    label: 'Continue with Facebook',
    bgColor: 'bg-[#1877F2] hover:bg-[#166FE5]',
    textColor: 'text-white',
    borderColor: 'border-[#1877F2]',
    iconColor: 'text-white'
  },
  github: {
    icon: Github,
    label: 'Continue with GitHub',
    bgColor: 'bg-[#24292F] hover:bg-[#1C2128]',
    textColor: 'text-white',
    borderColor: 'border-[#24292F]',
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