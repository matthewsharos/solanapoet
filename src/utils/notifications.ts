import { toast } from 'react-toastify';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface NotificationOptions {
  type?: NotificationType;
  duration?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
}

const DEFAULT_OPTIONS: Required<NotificationOptions> = {
  type: 'info',
  duration: 5000,
  position: 'top-right'
};

export function showNotification(
  message: string,
  options: NotificationOptions = {}
): void {
  const { type, duration, position } = { ...DEFAULT_OPTIONS, ...options };

  toast(message, {
    type,
    autoClose: duration,
    position,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true
  });
}

export function showTransactionNotification(
  signature: string,
  message: string = 'Transaction confirmed',
  options: NotificationOptions = {}
): void {
  const explorerUrl = `https://explorer.solana.com/tx/${signature}`;
  const notificationMessage = (
    <div>
      {message}
      <br />
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: '#3498db', textDecoration: 'underline' }}
      >
        View on Explorer
      </a>
    </div>
  );

  showNotification(notificationMessage as any, {
    type: 'success',
    ...options
  });
}

export function showErrorNotification(
  error: Error | string,
  options: NotificationOptions = {}
): void {
  const message = error instanceof Error ? error.message : error;
  showNotification(message, {
    type: 'error',
    ...options
  });
} 