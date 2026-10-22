# Probe (scratch only), after round 1's refuter of S2: put this PowerShell process (and so everything it starts) in a
# job object with JOB_OBJECT_UILIMIT_DESKTOP (0x40). Chromium's sandbox needs a desktop of its own, so a sandboxed
# Chromium dies at launch with no word of why, as on a Windows computer whose security software blocks the sandbox;
# Chromium without the sandbox needs none. Only this process tree is affected.
param([string]$Worktree, [string]$Probe)
$src = @'
using System;
using System.Runtime.InteropServices;
public static class J {
  [StructLayout(LayoutKind.Sequential)] public struct UI { public uint Class; }
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr CreateJobObject(IntPtr a, string n);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetInformationJobObject(IntPtr j, int c, ref UI i, uint l);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AssignProcessToJobObject(IntPtr j, IntPtr p);
  [DllImport("kernel32.dll")] public static extern IntPtr GetCurrentProcess();
}
'@
Add-Type -TypeDefinition $src
$job = [J]::CreateJobObject([IntPtr]::Zero, $null)
$ui = New-Object J+UI
$ui.Class = [uint32]0x40
if (-not [J]::SetInformationJobObject($job, 4, [ref]$ui, 4)) { throw "SetInformationJobObject failed" }
if (-not [J]::AssignProcessToJobObject($job, [J]::GetCurrentProcess())) { throw "AssignProcessToJobObject failed" }
"job assigned: JOB_OBJECT_UILIMIT_DESKTOP"
$env:BYWAY_WT = $Worktree
Set-Location $Worktree
& pnpm exec tsx $Probe 2>&1
