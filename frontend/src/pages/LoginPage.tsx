import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { register } from "@/lib/api";
import { Workflow, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const loginSchema = z.object({
  email: z.email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
});

const registerSchema = z.object({
  email: z.email({ message: "Invalid email address" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters long" })
    .regex(/[A-Z]/, {
      message: "Password must contain at least one uppercase letter",
    })
    .regex(/[a-z]/, {
      message: "Password must contain at least one lowercase letter",
    })
    .regex(/[0-9]/, { message: "Password must contain at least one number" })
    .regex(/[^a-zA-Z0-9]/, {
      message: "Password must contain at least one special character",
    }),
});

type FormData = z.infer<typeof registerSchema>;

export function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const { login, isLoading, error } = useAuthStore();
  const [localError, setLocalError] = useState("");
  const navigate = useNavigate();

  const {
    register: formRegister,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(isRegister ? registerSchema : loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: FormData) => {
    setLocalError("");
    try {
      if (isRegister) {
        await register(data.email, data.password);
        toast.success("Account created successfully");
      }
      await login(data.email, data.password);
      toast.success("Welcome back!");
      navigate("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setLocalError(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#18181b]">
      <div className="w-[400px] bg-[#1f1f23] border border-[#2e2e33] rounded-2xl p-10 shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="bg-[#ff6d5a] rounded-lg p-2 flex shadow-[0_4px_12px_rgba(255,109,90,0.2)]">
            <Workflow size={20} color="white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-zinc-100">
            Sentient Flow
          </span>
        </div>

        <p className="text-center text-[13px] text-zinc-500 mb-7">
          {isRegister
            ? "Create your account to start building"
            : "Welcome back, please log in"}
        </p>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="mb-4">
            <label className="block text-[12px] font-medium text-zinc-300 mb-1.5">
              Email
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              {...formRegister("email")}
              className="w-full h-10 px-3 bg-[#18181b] border border-[#2e2e33] rounded-lg text-[13px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#ff6d5a]/40 transition-colors"
            />
            {errors.email && (
              <span className="text-red-400 text-[11px] mt-1 block">
                {errors.email.message}
              </span>
            )}
          </div>

          <div className="mb-5">
            <label className="block text-[12px] font-medium text-zinc-300 mb-1.5">
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              {...formRegister("password")}
              className="w-full h-10 px-3 bg-[#18181b] border border-[#2e2e33] rounded-lg text-[13px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#ff6d5a]/40 transition-colors"
            />
            {errors.password && (
              <span className="text-red-400 text-[11px] mt-1 block">
                {errors.password.message}
              </span>
            )}
          </div>

          {(error || localError) && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4 text-[12px] text-red-400">
              {localError || error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-10 bg-[#ff6d5a] hover:bg-[#e85a48] disabled:bg-[#2a2a2f] disabled:text-zinc-500 text-white rounded-lg text-[13px] font-semibold transition-colors flex items-center justify-center gap-2 mt-2"
          >
            {isLoading && <Loader2 size={14} className="animate-spin" />}
            {isLoading
              ? "Loading…"
              : isRegister
                ? "Create Account"
                : "Sign In"}
          </button>
        </form>

        <div className="text-center mt-5 text-[12px]">
          <span className="text-zinc-500">
            {isRegister ? "Already have an account?" : "Don't have an account?"}
          </span>{" "}
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setLocalError("");
              reset();
            }}
            className="bg-transparent border-none text-[#ff6d5a] cursor-pointer text-[12px] font-medium hover:underline"
          >
            {isRegister ? "Login" : "Register"}
          </button>
        </div>
      </div>
    </div>
  );
}
