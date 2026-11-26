using System;
using System.Runtime.InteropServices;
namespace JmhWindows {
 [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] internal class Enumerator {}
 [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] internal interface IDevices {
  int EnumAudioEndpoints(int flow,int mask,out IntPtr devices);
  int GetDefaultAudioEndpoint(int flow,int role,out IDevice device);
 }
 [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] internal interface IDevice {
  int Activate(ref Guid id,int context,IntPtr parameters,[MarshalAs(UnmanagedType.IUnknown)]out object result);
 }
 [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] internal interface IVolume {
  int RegisterControlChangeNotify(IntPtr client);int UnregisterControlChangeNotify(IntPtr client);int GetChannelCount(out uint count);
  int SetMasterVolumeLevel(float level,ref Guid context);int SetMasterVolumeLevelScalar(float level,ref Guid context);
  int GetMasterVolumeLevel(out float level);int GetMasterVolumeLevelScalar(out float level);
 }
 [StructLayout(LayoutKind.Sequential)] public struct PowerStatus {public byte ACLineStatus,BatteryFlag,BatteryLifePercent,SystemStatusFlag;public uint BatteryLifeTime,BatteryFullLifeTime;}
 public static class Controls {
  [DllImport("kernel32.dll")]static extern bool GetSystemPowerStatus(out PowerStatus status);
  public static PowerStatus Power(){PowerStatus p;if(!GetSystemPowerStatus(out p))throw new Exception("Batterie indisponible.");return p;}
  static float Volume(int? percent){IDevices devices=(IDevices)new Enumerator();IDevice device=null;object raw=null;try{Marshal.ThrowExceptionForHR(devices.GetDefaultAudioEndpoint(0,1,out device));Guid id=typeof(IVolume).GUID;Marshal.ThrowExceptionForHR(device.Activate(ref id,23,IntPtr.Zero,out raw));IVolume volume=(IVolume)raw;if(percent.HasValue){if(percent<0||percent>100)throw new ArgumentOutOfRangeException("percent");Guid context=Guid.Empty;Marshal.ThrowExceptionForHR(volume.SetMasterVolumeLevelScalar(percent.Value/100f,ref context));}float level;Marshal.ThrowExceptionForHR(volume.GetMasterVolumeLevelScalar(out level));return level;}finally{if(raw!=null)Marshal.ReleaseComObject(raw);if(device!=null)Marshal.ReleaseComObject(device);Marshal.ReleaseComObject(devices);}}
  public static float GetVolume(){return Volume(null);}public static float SetVolume(int percent){return Volume(percent);}
 }
}
