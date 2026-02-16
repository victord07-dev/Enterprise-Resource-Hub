import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, QrCode, CheckCircle2, XCircle, Clock, ArrowLeft, Scan, Keyboard } from "lucide-react";

type KioskStep = "scan" | "confirm" | "selfie" | "success" | "error";

interface EmployeeInfo {
  id: string;
  name: string;
  department: string;
  designation: string;
}

interface AttendanceResult {
  type: "check_in" | "check_out" | "already_done";
  message: string;
  record: any;
}

export default function Kiosk() {
  const [step, setStep] = useState<KioskStep>("scan");
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [result, setResult] = useState<AttendanceResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [scannedQrCode, setScannedQrCode] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [manualQrInput, setManualQrInput] = useState("");
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<any>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {}
      scannerRef.current = null;
    }
  }, []);

  const resetToScan = useCallback(() => {
    stopCamera();
    stopScanner();
    setStep("scan");
    setEmployee(null);
    setResult(null);
    setErrorMsg("");
    setScannedQrCode(null);
    setSelfieDataUrl(null);
    setScanning(false);
    setManualEntry(false);
    setManualQrInput("");
  }, [stopCamera, stopScanner]);

  useEffect(() => {
    const autoReset = setTimeout(() => {
      if (step === "success" || step === "error") {
        resetToScan();
      }
    }, 8000);
    return () => clearTimeout(autoReset);
  }, [step, resetToScan]);

  const startQrScanner = useCallback(async () => {
    setScanning(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText: string) => {
          await scanner.stop();
          scannerRef.current = null;
          setScanning(false);
          await lookupEmployee(decodedText.trim());
        },
        () => {}
      );
    } catch (err: any) {
      setScanning(false);
      setErrorMsg("Could not access camera. Please allow camera permissions.");
      setStep("error");
    }
  }, []);

  const lookupEmployee = async (qrCode: string) => {
    try {
      const res = await fetch(`/api/kiosk/employee/${encodeURIComponent(qrCode)}`);
      if (!res.ok) {
        setErrorMsg("Employee not found. Please check your ID card.");
        setStep("error");
        return;
      }
      const data = await res.json();
      setEmployee(data);
      setScannedQrCode(qrCode);
      setStep("confirm");
    } catch {
      setErrorMsg("Connection error. Please try again.");
      setStep("error");
    }
  };

  const startSelfieCamera = useCallback(async () => {
    setStep("selfie");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setErrorMsg("Could not access front camera.");
      setStep("error");
    }
  }, []);

  const captureSelfie = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    setSelfieDataUrl(dataUrl);
    stopCamera();
  }, [stopCamera]);

  const submitAttendance = async () => {
    if (!employee || !scannedQrCode) return;
    setIsSubmitting(true);

    try {
      let selfieObjectPath: string | null = null;

      if (selfieDataUrl) {
        const blob = await (await fetch(selfieDataUrl)).blob();
        const file = new File([blob], `selfie-${employee.id}-${Date.now()}.jpg`, { type: "image/jpeg" });
        const urlRes = await fetch("/api/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        });
        if (urlRes.ok) {
          const { uploadURL, objectPath } = await urlRes.json();
          await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
          selfieObjectPath = objectPath;
        }
      }

      const res = await fetch("/api/kiosk/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrCode: scannedQrCode, selfieUrl: selfieObjectPath }),
      });

      if (!res.ok) {
        setErrorMsg("Failed to record attendance. Please try again.");
        setStep("error");
        return;
      }

      const data = await res.json();
      setResult(data);
      setStep("success");
    } catch {
      setErrorMsg("Connection error. Please try again.");
      setStep("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-4">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-white tracking-tight" data-testid="text-kiosk-title">NexERP Attendance Kiosk</h1>
        <p className="text-blue-200/70 text-lg mt-1" data-testid="text-kiosk-time">
          {currentTime.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          {" \u00B7 "}
          {currentTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </p>
      </div>

      {step === "scan" && (
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
              <QrCode className="w-10 h-10 text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold" data-testid="text-scan-heading">Scan Your QR Code</h2>
              <p className="text-muted-foreground mt-2">Hold your Employee ID card in front of the camera to mark attendance</p>
            </div>
            <div id="qr-reader" className="w-full" style={{ minHeight: scanning ? 300 : 0 }} />
            {!scanning && !manualEntry && (
              <div className="space-y-3 w-full">
                <Button className="w-full" onClick={startQrScanner} data-testid="button-start-scan">
                  <Scan className="w-4 h-4 mr-2" />
                  Start Scanner
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setManualEntry(true)} data-testid="button-manual-entry">
                  <Keyboard className="w-4 h-4 mr-2" />
                  Enter Code Manually
                </Button>
              </div>
            )}
            {scanning && (
              <p className="text-sm text-muted-foreground animate-pulse">Looking for QR code...</p>
            )}
            {manualEntry && (
              <div className="space-y-3 w-full">
                <Input
                  placeholder="Enter Employee QR Code (e.g., NEXERP-EMP-...)"
                  value={manualQrInput}
                  onChange={(e) => setManualQrInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && manualQrInput.trim()) {
                      lookupEmployee(manualQrInput.trim());
                    }
                  }}
                  data-testid="input-manual-qr"
                  autoFocus
                />
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => { setManualEntry(false); setManualQrInput(""); }} data-testid="button-cancel-manual">
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => manualQrInput.trim() && lookupEmployee(manualQrInput.trim())}
                    disabled={!manualQrInput.trim()}
                    data-testid="button-submit-manual"
                  >
                    Look Up
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === "confirm" && employee && (
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold" data-testid="text-confirm-heading">Employee Identified</h2>
              <div className="mt-4 space-y-2">
                <p className="text-2xl font-bold" data-testid="text-employee-name">{employee.name}</p>
                <p className="text-muted-foreground" data-testid="text-employee-dept">{employee.department} &middot; {employee.designation}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={resetToScan} data-testid="button-cancel-confirm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button className="flex-1" onClick={startSelfieCamera} data-testid="button-take-selfie">
                <Camera className="w-4 h-4 mr-2" />
                Take Selfie
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "selfie" && (
        <Card className="w-full max-w-md">
          <CardContent className="p-6 space-y-4">
            <h2 className="text-xl font-semibold text-center" data-testid="text-selfie-heading">
              {selfieDataUrl ? "Confirm Your Selfie" : "Take a Selfie"}
            </h2>
            {employee && (
              <p className="text-center text-muted-foreground">{employee.name}</p>
            )}
            <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3]">
              {!selfieDataUrl ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                  data-testid="video-selfie-preview"
                />
              ) : (
                <img
                  src={selfieDataUrl}
                  alt="Captured selfie"
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                  data-testid="img-selfie-captured"
                />
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <div className="flex gap-3">
              {!selfieDataUrl ? (
                <>
                  <Button variant="outline" className="flex-1" onClick={resetToScan} data-testid="button-cancel-selfie">
                    Cancel
                  </Button>
                  <Button className="flex-1" onClick={captureSelfie} data-testid="button-capture-selfie">
                    <Camera className="w-4 h-4 mr-2" />
                    Capture
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setSelfieDataUrl(null); startSelfieCamera(); }}
                    data-testid="button-retake-selfie"
                  >
                    Retake
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={submitAttendance}
                    disabled={isSubmitting}
                    data-testid="button-submit-attendance"
                  >
                    {isSubmitting ? "Submitting..." : "Submit Attendance"}
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === "success" && result && (
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center space-y-6">
            <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center ${
              result.type === "already_done"
                ? "bg-amber-50 dark:bg-amber-950/40"
                : "bg-emerald-50 dark:bg-emerald-950/40"
            }`}>
              {result.type === "already_done" ? (
                <Clock className="w-10 h-10 text-amber-500" />
              ) : (
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold" data-testid="text-success-heading">
                {result.type === "check_in" && "Checked In!"}
                {result.type === "check_out" && "Checked Out!"}
                {result.type === "already_done" && "Already Completed"}
              </h2>
              <p className="text-2xl font-bold mt-2" data-testid="text-success-name">{employee?.name}</p>
              <p className="text-muted-foreground mt-1">{result.message}</p>
              {result.type === "check_in" && result.record?.checkIn && (
                <p className="text-lg font-medium text-emerald-600 mt-3" data-testid="text-checkin-time">
                  Check-in: {new Date(result.record.checkIn).toLocaleTimeString("en-IN")}
                </p>
              )}
              {result.type === "check_out" && result.record?.checkOut && (
                <p className="text-lg font-medium text-blue-600 mt-3" data-testid="text-checkout-time">
                  Check-out: {new Date(result.record.checkOut).toLocaleTimeString("en-IN")}
                </p>
              )}
            </div>
            <Button variant="outline" onClick={resetToScan} data-testid="button-done">
              Done
            </Button>
            <p className="text-xs text-muted-foreground">Auto-returning to scanner in a few seconds...</p>
          </CardContent>
        </Card>
      )}

      {step === "error" && (
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
              <XCircle className="w-10 h-10 text-red-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold" data-testid="text-error-heading">Something Went Wrong</h2>
              <p className="text-muted-foreground mt-2" data-testid="text-error-message">{errorMsg}</p>
            </div>
            <Button onClick={resetToScan} data-testid="button-try-again">
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      <p className="text-blue-200/40 text-xs mt-8">NexERP Kiosk System v1.0</p>
    </div>
  );
}
