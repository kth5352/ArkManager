import { toast } from 'sonner'

export const appToast = {
  success: (message: string, options?: Parameters<typeof toast.success>[1]) =>
    toast.success(message, { duration: 3500, ...options }),
  error: (message: string, options?: Parameters<typeof toast.error>[1]) =>
    toast.error(message, { duration: 5000, ...options }),
  info: (message: string, options?: Parameters<typeof toast>[1]) =>
    toast(message, { duration: 3500, ...options }),
}
