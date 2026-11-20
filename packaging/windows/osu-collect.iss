; Inno Setup script for the osu!collect Windows installer.
;
; Built by .github/workflows/release.yml:
;   iscc /DAppVersion=0.7.0 /DSourceExe=path\to\osu-collect.exe /DOutputDir=out packaging\windows\osu-collect.iss
;
; Per-user install (no admin prompt), like install.bat: the in-app updater
; replaces the exe in place, which needs a user-writable folder.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceExe
  #define SourceExe "..\..\target\x86_64-pc-windows-msvc\release\osu-collect.exe"
#endif
#ifndef OutputDir
  #define OutputDir "..\..\dist"
#endif

#define AppName "osu!collect"
#define AppExe "osu-collect.exe"
#define AppUrl "https://github.com/Underspace1/osu-collect"

[Setup]
AppId={{6E0F3C1B-3D8A-4C55-9C2E-0C9B7A4F1D21}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=osu!collect
AppPublisherURL={#AppUrl}
AppSupportURL={#AppUrl}/issues
AppUpdatesURL={#AppUrl}/releases
DefaultDirName={localappdata}\Programs\osu-collect
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=osu-collect-setup-x64
SetupIconFile=osu-collect.ico
UninstallDisplayIcon={app}\osu-collect.ico
UninstallDisplayName={#AppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ChangesEnvironment=yes
CloseApplications=yes
LicenseFile=..\..\LICENSE-MIT

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[CustomMessages]
english.WebShortcut=osu!collect
french.WebShortcut=osu!collect
english.TerminalShortcut=osu!collect (terminal)
french.TerminalShortcut=osu!collect (terminal)
english.AddToPath=Add osu-collect to PATH (use it from any terminal)
french.AddToPath=Ajouter osu-collect au PATH (l'utiliser depuis n'importe quel terminal)
english.LaunchWeb=Open osu!collect now
french.LaunchWeb=Ouvrir osu!collect maintenant

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "addtopath"; Description: "{cm:AddToPath}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#SourceExe}"; DestDir: "{app}"; DestName: "{#AppExe}"; Flags: ignoreversion
Source: "osu-collect.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; The main shortcut opens the web interface in the default browser.
Name: "{group}\{cm:WebShortcut}"; Filename: "{app}\{#AppExe}"; Parameters: "web"; WorkingDir: "{app}"; IconFilename: "{app}\osu-collect.ico"
Name: "{group}\{cm:TerminalShortcut}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{userdocs}"; IconFilename: "{app}\osu-collect.ico"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{cm:WebShortcut}"; Filename: "{app}\{#AppExe}"; Parameters: "web"; WorkingDir: "{app}"; IconFilename: "{app}\osu-collect.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Parameters: "web"; Description: "{cm:LaunchWeb}"; Flags: nowait postinstall skipifsilent

[Registry]
; Per-user PATH entry, only added when absent; removed again on uninstall.
Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}"; Tasks: addtopath; Check: NeedsAddPath(ExpandConstant('{app}'))

[UninstallDelete]
Type: files; Name: "{app}\osu-collect.rollback"

[Code]
function NeedsAddPath(Dir: string): Boolean;
var
  Current: string;
begin
  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', Current) then
  begin
    Result := True;
    exit;
  end;
  Result := Pos(';' + Uppercase(Dir) + ';', ';' + Uppercase(Current) + ';') = 0;
end;

procedure RemoveFromPath(Dir: string);
var
  Current, Needle: string;
  P: Integer;
begin
  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', Current) then
    exit;
  Needle := ';' + Uppercase(Dir);
  P := Pos(Needle + ';', ';' + Uppercase(Current) + ';');
  if P = 0 then
    exit;
  // P indexes the ';'-padded copy; map it back onto the original string.
  if P = 1 then
    Delete(Current, 1, Length(Dir) + 1)
  else
    Delete(Current, P - 1, Length(Dir) + 1);
  RegWriteExpandStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', Current);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    RemoveFromPath(ExpandConstant('{app}'));
end;
