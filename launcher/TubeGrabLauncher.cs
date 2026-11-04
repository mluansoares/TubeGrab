// Launcher do TubeGrab.
//
// Feito para ser chato: sem strings montadas, sem execucao oculta, sem
// compactacao. Ele so abre o launcher\TubeGrab.bat exatamente como um duplo
// clique faria (ShellExecute), o que evita o padrao "shell -> script" que
// costuma incomodar heuristicas de antivirus.
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("TubeGrab")]
[assembly: AssemblyDescription("Abre o launcher do TubeGrab (launcher\\TubeGrab.bat).")]
[assembly: AssemblyProduct("TubeGrab")]
[assembly: AssemblyCompany("TubeGrab")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace TubeGrabLauncher
{
    internal static class Program
    {
        [STAThread]
        private static int Main()
        {
            string root = AppDomain.CurrentDomain.BaseDirectory;
            string script = Path.Combine(Path.Combine(root, "launcher"), "TubeGrab.bat");

            if (!File.Exists(script))
            {
                MessageBox.Show(
                    "Nao encontrei launcher\\TubeGrab.bat ao lado deste executavel."
                        + Environment.NewLine + Environment.NewLine
                        + "Coloque o TubeGrab.exe na pasta raiz do projeto, junto do package.json.",
                    "TubeGrab",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return 1;
            }

            try
            {
                ProcessStartInfo start = new ProcessStartInfo();
                start.FileName = script;
                start.WorkingDirectory = root;
                start.UseShellExecute = true;
                Process.Start(start);
                return 0;
            }
            catch (Exception error)
            {
                MessageBox.Show(
                    "Nao consegui iniciar o TubeGrab."
                        + Environment.NewLine + Environment.NewLine
                        + error.Message,
                    "TubeGrab",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return 1;
            }
        }
    }
}
