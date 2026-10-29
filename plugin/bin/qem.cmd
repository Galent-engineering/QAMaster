@echo off
rem Runs the QeMaster CLI from this plugin, in the caller's directory.
node "%~dp0..\src\cli\main.mts" %*
