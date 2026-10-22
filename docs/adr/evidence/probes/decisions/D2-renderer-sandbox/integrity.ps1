param([int]$ParentPid)
# Lists every chrome-headless-shell process below $ParentPid with its --type, whether it has --no-sandbox, and its
# Windows integrity level (0x0000 Untrusted, 0x1000 Low, 0x2000 Medium, 0x3000 High). Read-only.
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class IL {
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr h, uint access, out IntPtr token);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetTokenInformation(IntPtr token, int cls, IntPtr info, int len, out int ret);
  [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
  [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid, uint i);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  public static string Level(int pid) {
    IntPtr h = OpenProcess(0x1000, false, pid);
    if (h == IntPtr.Zero) return "open-failed:" + Marshal.GetLastWin32Error();
    IntPtr t;
    if (!OpenProcessToken(h, 0x0008, out t)) { int e = Marshal.GetLastWin32Error(); CloseHandle(h); return "token-failed:" + e; }
    int len; GetTokenInformation(t, 25, IntPtr.Zero, 0, out len);
    IntPtr buf = Marshal.AllocHGlobal(len);
    try {
      if (!GetTokenInformation(t, 25, buf, len, out len)) return "info-failed";
      IntPtr sid = Marshal.ReadIntPtr(buf);
      int count = Marshal.ReadByte(GetSidSubAuthorityCount(sid));
      int rid = Marshal.ReadInt32(GetSidSubAuthority(sid, (uint)(count - 1)));
      return "0x" + rid.ToString("X4");
    } finally { Marshal.FreeHGlobal(buf); CloseHandle(t); CloseHandle(h); }
  }
}
"@
$all = @(Get-CimInstance Win32_Process)
$ids = New-Object System.Collections.Generic.HashSet[int]
[void]$ids.Add($ParentPid)
$found = @()
$grew = $true
while ($grew) {
  $grew = $false
  foreach ($p in $all) {
    if ($ids.Contains([int]$p.ParentProcessId) -and -not $ids.Contains([int]$p.ProcessId)) {
      [void]$ids.Add([int]$p.ProcessId)
      $grew = $true
      if ($p.Name -like 'chrome*') { $found += $p }
    }
  }
}
$out = foreach ($p in $found) {
  $cl = [string]$p.CommandLine
  $type = if ($cl -match '--type=([a-z\-]+)') { $Matches[1] } else { 'browser' }
  $sub = if ($cl -match '--utility-sub-type=([A-Za-z\.]+)') { $Matches[1] } else { '' }
  [pscustomobject]@{ pid = $p.ProcessId; type = $type; sub = $sub; noSandbox = $cl.Contains('--no-sandbox'); integrity = [IL]::Level([int]$p.ProcessId) }
}
@($out) | ConvertTo-Json -Compress
