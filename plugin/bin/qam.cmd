@echo off
rem Runs the QAMaster CLI from this plugin, in the caller's directory.
node "%~dp0..\src\cli\main.mts" %*
