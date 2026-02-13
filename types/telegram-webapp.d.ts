type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
};

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
};
