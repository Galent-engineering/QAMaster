@echo off
rem Runs the QAMaster CLI from this checkout, in the caller's directory (development only: the plugin ships no bin/, Q45).
node "%~dp0..\plugin\src\cli\main.mts" %*
