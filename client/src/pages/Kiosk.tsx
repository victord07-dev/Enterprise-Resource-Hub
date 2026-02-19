import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, QrCode, CheckCircle2, XCircle, Clock, ArrowLeft, Scan, Keyboard, Coffee, UtensilsCrossed, LogOut } from "lucide-react";

type KioskStep = "scan" | "confirm" | "choose_action" | "selfie" | "success" | "error";
type AttendanceAction = "check_in" | "check_out" | "lunch_out" | "lunch_in" | "tea_out" | "tea_in";

interface EmployeeInfo {
  id: string;
  name: string;
  department: string;
  designation: string;
  todayAttendance: any;
}

interface AttendanceResult {
  type: AttendanceAction | "already_done" | "waiting";
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
  const [selectedAction, setSelectedAction] = useState<AttendanceAction | null>(null);
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
    setSelectedAction(null);
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

      const attendance = data.todayAttendance;
      if (!attendance) {
        setSelectedAction("check_in");
        setStep("confirm");
      } else if (attendance.checkOut) {
        setResult({ type: "already_done", message: "Attendance already completed for today", record: attendance });
        setStep("success");
      } else if (attendance.lunchOut && !attendance.lunchIn) {
        setSelectedAction("lunch_in");
        setStep("confirm");
      } else if (attendance.teaOut && !attendance.teaIn) {
        setSelectedAction("tea_in");
        setStep("confirm");
      } else {
        setStep("choose_action");
      }
    } catch {
      setErrorMsg("Connection error. Please try again.");
      setStep("error");
    }
  };

  const getAvailableActions = () => {
    if (!employee?.todayAttendance) return [];
    const att = employee.todayAttendance;
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const timeInMinutes = hours * 60 + minutes;

    const actions: { action: AttendanceAction; label: string; icon: any; color: string }[] = [];

    if (!att.lunchOut && timeInMinutes >= 780 && timeInMinutes <= 870) {
      actions.push({ action: "lunch_out", label: "Lunch Break", icon: UtensilsCrossed, color: "text-orange-500" });
    }

    if (!att.teaOut && timeInMinutes >= 1020 && timeInMinutes <= 1050) {
      actions.push({ action: "tea_out", label: "Tea Break", icon: Coffee, color: "text-purple-500" });
    }

    actions.push({ action: "check_out", label: "Check Out", icon: LogOut, color: "text-blue-500" });

    return actions;
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
    if (!employee || !scannedQrCode || !selectedAction) return;
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
        body: JSON.stringify({ qrCode: scannedQrCode, selfieUrl: selfieObjectPath, action: selectedAction }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ message: "Failed to record attendance" }));
        setErrorMsg(errData.message || "Failed to record attendance. Please try again.");
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

  const getActionLabel = (action: AttendanceAction) => {
    switch (action) {
      case "check_in": return "Check In";
      case "check_out": return "Check Out";
      case "lunch_out": return "Lunch Break";
      case "lunch_in": return "Back from Lunch";
      case "tea_out": return "Tea Break";
      case "tea_in": return "Back from Tea";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-4">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-white tracking-tight" data-testid="text-kiosk-title">Hussain Group Attendance Kiosk</h1>
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
                  placeholder="Enter Employee QR Code (e.g., HG-EMP-...)"
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

      {step === "choose_action" && employee && (
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-action-employee-name">{employee.name}</p>
              <p className="text-muted-foreground" data-testid="text-action-employee-dept">{employee.department} &middot; {employee.designation}</p>
              <p className="text-sm text-emerald-600 mt-2 font-medium">Checked in today</p>
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-4" data-testid="text-action-heading">What would you like to do?</h2>
              <div className="space-y-3">
                {getAvailableActions().map(({ action, label, icon: Icon, color }) => (
                  <Button
                    key={action}
                    variant="outline"
                    className="w-full justify-start gap-3 h-14 text-base"
                    onClick={() => { setSelectedAction(action); startSelfieCamera(); }}
                    data-testid={`button-action-${action}`}
                  >
                    <Icon className={`w-5 h-5 ${color}`} />
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <Button variant="ghost" onClick={resetToScan} data-testid="button-cancel-action">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "confirm" && employee && (
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center space-y-6">
            <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center ${
              selectedAction === "lunch_in" ? "bg-orange-50 dark:bg-orange-950/40"
              : selectedAction === "tea_in" ? "bg-purple-50 dark:bg-purple-950/40"
              : "bg-emerald-50 dark:bg-emerald-950/40"
            }`}>
              {selectedAction === "lunch_in" ? (
                <UtensilsCrossed className="w-10 h-10 text-orange-500" />
              ) : selectedAction === "tea_in" ? (
                <Coffee className="w-10 h-10 text-purple-500" />
              ) : (
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold" data-testid="text-confirm-heading">
                {selectedAction === "check_in" ? "Employee Identified" : getActionLabel(selectedAction!)}
              </h2>
              <div className="mt-4 space-y-2">
                <p className="text-2xl font-bold" data-testid="text-employee-name">{employee.name}</p>
                <p className="text-muted-foreground" data-testid="text-employee-dept">{employee.department} &middot; {employee.designation}</p>
              </div>
              {selectedAction && selectedAction !== "check_in" && (
                <p className="text-sm font-medium mt-3" data-testid="text-action-type">
                  Action: {getActionLabel(selectedAction)}
                </p>
              )}
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
              <div className="text-center">
                <p className="text-muted-foreground">{employee.name}</p>
                {selectedAction && (
                  <p className="text-sm font-medium mt-1">{getActionLabel(selectedAction)}</p>
                )}
              </div>
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
              result.type === "already_done" || result.type === "waiting"
                ? "bg-amber-50 dark:bg-amber-950/40"
                : result.type === "lunch_out" || result.type === "lunch_in"
                ? "bg-orange-50 dark:bg-orange-950/40"
                : result.type === "tea_out" || result.type === "tea_in"
                ? "bg-purple-50 dark:bg-purple-950/40"
                : "bg-emerald-50 dark:bg-emerald-950/40"
            }`}>
              {result.type === "already_done" || result.type === "waiting" ? (
                <Clock className="w-10 h-10 text-amber-500" />
              ) : result.type === "lunch_out" || result.type === "lunch_in" ? (
                <UtensilsCrossed className="w-10 h-10 text-orange-500" />
              ) : result.type === "tea_out" || result.type === "tea_in" ? (
                <Coffee className="w-10 h-10 text-purple-500" />
              ) : (
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold" data-testid="text-success-heading">
                {result.type === "check_in" && "Checked In!"}
                {result.type === "check_out" && "Checked Out!"}
                {result.type === "lunch_out" && "Lunch Break"}
                {result.type === "lunch_in" && "Back from Lunch!"}
                {result.type === "tea_out" && "Tea Break"}
                {result.type === "tea_in" && "Back from Tea!"}
                {result.type === "already_done" && "Already Completed"}
                {result.type === "waiting" && "Please Wait"}
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
              {result.type === "lunch_out" && result.record?.lunchOut && (
                <p className="text-lg font-medium text-orange-600 mt-3" data-testid="text-lunch-out-time">
                  Lunch Out: {new Date(result.record.lunchOut).toLocaleTimeString("en-IN")}
                </p>
              )}
              {result.type === "lunch_in" && result.record?.lunchIn && (
                <p className="text-lg font-medium text-orange-600 mt-3" data-testid="text-lunch-in-time">
                  Lunch In: {new Date(result.record.lunchIn).toLocaleTimeString("en-IN")}
                </p>
              )}
              {result.type === "tea_out" && result.record?.teaOut && (
                <p className="text-lg font-medium text-purple-600 mt-3" data-testid="text-tea-out-time">
                  Tea Out: {new Date(result.record.teaOut).toLocaleTimeString("en-IN")}
                </p>
              )}
              {result.type === "tea_in" && result.record?.teaIn && (
                <p className="text-lg font-medium text-purple-600 mt-3" data-testid="text-tea-in-time">
                  Tea In: {new Date(result.record.teaIn).toLocaleTimeString("en-IN")}
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

      <p className="text-blue-200/40 text-xs mt-8">Hussain Group Kiosk System v1.0</p>
    </div>
  );
}
