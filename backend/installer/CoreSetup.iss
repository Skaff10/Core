#define MyAppName "CORE Command Center"
#define MyAppVersion "1.0.2"
#define MyAppPublisher "Skaff10"
#define MyAppURL "https://github.com/Skaff10/Core"
#define MyAppExeName "CoreServer.exe"

[Setup]
AppId={{8E74A8C3-5B4A-4B53-9F6E-1C62E2C1A901}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\CoreCommandCenter
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=admin
OutputDir=..\..\dist
OutputBaseFilename=CoreCommandCenter-Setup-v{#MyAppVersion}-win64
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "autostart"; Description: "Auto-open CORE Command Center whenever Windows starts"; GroupDescription: "Startup & Network:"; Flags: checkedonce
Name: "firewall"; Description: "Allow the selected server port in Windows Firewall (recommended for mobile pairing)"; GroupDescription: "Startup & Network:"; Flags: checkedonce
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "Shortcuts:"

[Files]
Source: "dist\CoreServer\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "CoreCommandCenter"; ValueData: """{app}\{#MyAppExeName}"" --startup"; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\{#MyAppExeName}"; Parameters: "--set-port {code:GetSelectedPort}"; Flags: runhidden waituntilterminated
Filename: "netsh.exe"; Parameters: "advfirewall firewall delete rule name=""CORE Command Center"""; Flags: runhidden waituntilterminated; Tasks: firewall
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""CORE Command Center"" dir=in action=allow protocol=TCP localport={code:GetSelectedPort} program=""{app}\{#MyAppExeName}"""; Flags: runhidden waituntilterminated; Tasks: firewall
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill.exe"; Parameters: "/F /IM {#MyAppExeName}"; Flags: runhidden waituntilterminated; RunOnceId: "KillCoreServer"
Filename: "netsh.exe"; Parameters: "advfirewall firewall delete rule name=""CORE Command Center"""; Flags: runhidden waituntilterminated; RunOnceId: "DelCoreFirewall"

[Code]
var
  PortPage: TInputQueryWizardPage;
  SelectedPort: String;

procedure InitializeWizard;
begin
  SelectedPort := '8000';
  PortPage := CreateInputQueryPage(
    wpSelectTasks,
    'Server Port Configuration',
    'Choose the TCP port for the CORE Command Center PC server.',
    'Your mobile app will connect to your PC using this port (default is 8000). You can also change this later in %LOCALAPPDATA%\CoreCommandCenter\config.json.'
  );
  PortPage.Add('Server Port (1 - 65535):', False);
  PortPage.Values[0] := SelectedPort;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  PortNum: Integer;
begin
  Result := True;
  if CurPageID = PortPage.ID then
  begin
    PortNum := StrToIntDef(Trim(PortPage.Values[0]), -1);
    if (PortNum < 1) or (PortNum > 65535) then
    begin
      MsgBox('Please enter a valid TCP port number between 1 and 65535.', mbError, MB_OK);
      Result := False;
    end
    else
    begin
      SelectedPort := IntToStr(PortNum);
    end;
  end;
end;

function GetSelectedPort(Param: String): String;
begin
  Result := SelectedPort;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/F /IM CoreServer.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;
