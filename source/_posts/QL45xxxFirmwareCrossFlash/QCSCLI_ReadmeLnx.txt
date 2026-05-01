                        ============================
                          R E A D M E    N O T E S
                        ============================

                 QLogic QCS command line interface utility
                                 for Linux
                         
                 Copyright (c) 2022 Marvell Semiconductor Inc.
                            All rights reserved.



Table of Contents
=================
    1. Introduction
    2. Requirements
    3. Scope 
    4. Installation
    5. Uninstall
    6. Limitation
	7. Additional Notes
    8. Command Usage
    9. HowTo and Examples 
    10. Configuration File Usage:
    11. Exit Codes
    12. Third Party Software License


1. Introduction:
================
This utility is a console application. Users could run it from a Linux
terminal console. The application will use the console and can be run 
both in the command line interface (CLI) mode as well as interactive mode.

In the non-interactive (CLI) mode, the utility can take a command 
as an input argument and run the command producing appropriate effect/output 
and return meaningful exit codes.

This module requires the appropriate QLMAPI module and device driver in
order to work correctly.
This utility can also be used to manage Network devices on both local 
as well as remote computer systems.


2. Requirements:
================
    
     1. Appropriate device driver for the NIC is installed on the 
         system that is to be managed by this utility.
     
     2. On the system with QLogic Network adapters, install
         the QLogic NxAgent if desire for remote management
         capability supports.    
    
    3. For managing iscsi on Linux hosts, open-iscsi is required to be installed on the Linux host.
    4. For linux, managing LUN related info [ for iSCSI/FCoE ] 'sg3_utils' package required to be installed.


3. Scope:
=========
Supported Operating Systems

    - RedHat 5
    - Redhat 6
        - Redhat 6.7 (Supports PPC64BE)
    - Redhat 7
        - Redhat 7.2 (Supports PPC64BE)
        - Redhat 7.3
    - Suse 10
    - Suse 11
        - Suse 11.4 (Supports PPC64BE)

    - Suse 12
        - Sles12sp2

    - Citrix 7 (Dundee - E3 only)
    - Ubuntu 14.04
    - Ubuntu 14.10
    - Ubuntu 16.04
    - PowerKVM 3.1


4. Installation:
================
    1. On the system with QLogic Network Adapters, install
       the appropriate driver package using the driver installer.
       
    2. On the system with QLogic Network Adapters, install
       the QLogic NxAgent and its dependent components. 

    3. QCScli and all the required files can be installed automatically 
       by the QCS installer.
	   
	   rpm -ivh <package_name>.rpm
       
    4. Please use the following command to install RPM package on Debian/Ubuntu.
    
       sudo apt-get install alien   ( To install "alien" command,  if not available )
       
       alien -i <package_name>.rpm  ( To convert RPM to DEB and install )
       
       dpkg -l qcs-cli              ( To view the installed Debian package )
       
    5. Ubuntu: When apt-get is also not available/installed, the RPM can be installed with following option.
       rpm --ignorearch <package_name>.rpm
          
5. Uninstall 
==============

- RPM package : 
   
    rpm -e <package_name>.rpm

- Debian packages :

    dpkg -r qcs-cli

    
6. Limitations
================

    1. DCBNL is supported for inbox drivers for RHEL6.2 and SLES11SP2 and later.
    2. DCBX is not supported on Red Hat 5 and SuSE 10 due to lack of kernel support.
    3. iSCSI DataDigest login option is not supported by Red Hat.
    4. iSCSI MPIO login option is not available. MPIO for Linux iSCSI operates 
       different than Windows. For Linux, two iSCSI sessions need to be established
       to the same target LUN first. Then the multipathd, needs to be started so the 
       SCSI layer would treat the device mapper disk as one disk. This has nothing to 
       do with actual iSCSI login procedure, So there is no MPIO option during login.
    5. ISCSI offload features are not available on SuSE 10 due to lack of kernel support.
    6. No Configuration is available if the device interface is down.
    7. Network test, On Chip CPU test, Cable analysis are not supported currently.
    8. Loopback Phy, Loopback MAC tests are not supported currently on Multi-function mode for E3 Adapters.


7. Additional Notes:
==============
    1. (E4 only) Recommended Bandwidth setting for 25G/40G/100G adapters
		- For 25G/40G/100G adapters, if DCBX/ETS are used, setting of bandwidth to 0 on storage functions is the best practice.
    2. iSCSI Ping Test: 
		This test may fail/pass based on the real time network traffic and bandwidth.
		If few pings are successful and few fail, it could be expected.
		If the ping test fails repeatedly, this can be an issue.


    3. Known issue for BCM57810 and BCM57840-based adapter and Workaround:
           Some of the most recent kernels (for example in SLES15) has a security feature to prevent 
           user space access to physical memory above 1MB (IIRC). Due to which "firmmare upgrade tool"
           may not function properly. There are couple of workaround:
                 A. At boot time: Add iomem=relaxed in kernel command line during boot time.
                 B. Update grub.cfg file: 
                   - add iomem=relaxed at the end for GRUB_CMDLINE_LINUX_DEFAULT parameter in file 
                              /etc/default/grub.cfg (based on the distro, location of grub.cfg may vary)
                   - run cmd grub2-mkconfig -o /boot/grub2/grub.cfg
                   - reboot the server to take effect
8. Command Usage:
=================
Usage:
7.1 POSIX-compliant commands:
    QCScli [-t <target type>] [-f <target ID format>] [-i <target ID>]
    [-r <IP address>] [-p <password>]
    [-protocol <rpc | local>][-persist]
    <command string>
    
    - The -t option is used to select the type of the target, it must be
      followed by the <target type> that can be VBD, NDIS, iSCSI, iSCSI Portal, iSCSITargets, 
      TEAM, VNIC, FCOE, FCoE Target, PhyAdapters, PhyPorts, Hosts or system.
    - The -f option is used to select the format of the <target ID> used
      in the -i option.  The <target ID format> can be MAC, BDF, or NAME.
      The MAC and BDF are used to select a device of a <target type>.
      The NAME is used to select either a Team or a Virtual adapter.
    - The -i option is used to select the target identified by the <target ID>.
      The <target ID> can be the Ethernet MAC address (using the NDIS device’s MAC address 
      for Ethernet and using the iSCSI device’s MAC address for iSCSI Hardware Offload and 
      using the teaming MAC address for VDB), the PCI Bus/Device/Function number, iSCSI target
      name or the name of a Team/Virtual adapter or host name.
    - The -r option is used to specify an IP address of a host to be accessed.
      If no -r option CLi tried to read persist host file and connects to all hosts in this file.
      when -r option exists, only specified host is connected and <command string> only apply to
      the specified host
    -p <password> is used to specify qlnxremote agent password. 
        [-protocol <rpc | local>] option is used to specify connection protocol.
            'rpc' is remote procedure call, 'local' is direct calls on the local system.
    - The -persist option indicates the host information will be saved to the persistent hosts 
      file when qcscli exits.
    - The <command string> includes the command, its options,
      parameters, and values for the command. <command string> have to be 
      specified within the double quotes, but if the <command string> 
      contains only one command without any option or command argument, 
      the double quotes is optional.
    - If any name or parameter contains special character such as '^', '&'
      and so on, it needs to be specified in double quotes, "^" for example.

    Following is the list of available commands:
    adddiscoveryportal     : add a discovery portal to the host
    addhost                : add a remote host for management
    addisnsserver          : add the IP address or DNS name of an iSNS server to the list of iSNS servers
    addtarget              : manually configure a target and optionally persist that target
    bootcfg                : use this command to do MBA/FCoE/iSCSI boot configuration 
    cfg                    : configure parameter of the selected device
    upgrade                : Upgrade the MBI FW Image on adapter [NOTE: upgrade/downgrade depends on the Image Version]
                             QCScli would forcefully upgrade to version present in the MBI Image File.
    createmultinpivport    : create multiple NPIV ports
    createnpivport         : create a NPIV port
    diag                   : configure and conduct a diagnostic test
    discoverhost           : search and add remote hosts from a range of IP addresses
    help                   : list available commands
    info                   : display adapter information of the selected NIC
    list                   : list target items in different views
    listisnsservers        : display the list of iSNS server addresses that are persisted by the iSCSI Initiator service.
    listdiscoveryportals   : display the list of persisted target portals 
    log                    : log all input and output into a file
    login                  : log in to an iSCSI target
    logout                 : log out of an iSCSI target
    networkdiag            : run network diagnostic test on the selected NDIS device
    q                      : exit the program
    refresh                : scan the system for hardware/configuration changes
    refreshall             : scan all systems for hardware/configuration changes
    refreshdiscoveryportal : perform a SendTargets operation to the target portal 
    refreshisnsserver      : refresh the list of targets discovered from the specified iSNS server
    removediscoveryportal  : remove discovery portal from the host
    removeallhosts         : remove all hosts from the host management list
    removealltmhosts       : remove all TruManage hosts from the host management list    
    removehost             : remove a host from the host management list
    removeisnsserver       : remove the IP address or DNS name of the iSNS server from the persisted list of iSNS servers
    removemultinpivport    : remove multiple NPIV ports
    removenpivport         : remove a NPIV port
    removepersistenttarget : remove a target from the list of persistent targets
    removetarget           : remove a target from the list of persisted targets
    resetsessionstats      : display session statistics for all or the selected session
    resetstats             : Reset the statistics
    select                 : select an adapter or List available adapters
    sessions               : display list of iSCSI sessions on the selected iSCSI adapter.
    sessionstats           : display session statistics for all or the selected session
    showsel                : show the selected target item
    stats                  : display statistic information of the selected NIC
    version                : display the version of this program

 7.1.1 Applicable commands for each item view:

    All:
        addhost 
        discoverhost
        help 
        list 
        log 
        q
        removeallhosts 
        removehost 
        select 
        showsel   
        version   
         
    FCoE:
        cfg
        createmultinpivport
        createnpivport
        info 
        removemultinpivport
        removenpivport
        resetstats
        stats

    FCoETarget:
        info 
  	
    FCPort:
        info 

    Host:
        adddiscoveryportal
        addisnsserver
        addtarget
        cfg
        info
        listdiscoveryportals
        listisnsservers
        login
        logout
        refresh
        refreshall
        refreshdiscoveryportal
        refreshisnsserver
        removediscoveryportal
        removeisnsserver
        removepersistenttarget
        removetarget

    iSCSI:
        cfg
        info 
        login
        logout
        resetsessionstats
        resetstats
        sessions
        sessionstats
        stats

    iSCSIPortal:
        info 
        resetsessionstats
        sessionstats

    iSCSITarget:
        info 
        login
        logout
        removepersistenttarget
        resetsessionstats
        sessionstats

    LUN:
        info 

    NDIS:
        cfg
        info 
        networkdiag
        resetstats
        stats

    PhyAdapter:
        cfg
        info 
        upgrade

    PhyPort:
        bootcfg
        cablediag
        cfg
        diag
        info 
        resetstats
        stats

    Teamview:
        add
        fallback
        info
        remove
        resetstats
        restore
        save
        stats
        unassigned

    VBD:
        cfg
        info 
        resetstats
        stats


    VNIC:
        info
        networkdiag
        resetstats
        stats

	
	If user sees INVALID command prompt it means command is not valid
	at this level and user should use the correct command from commands 
	described above for each item view.

         
 
 7.1.2 Command Syntax:

    add [-h <host>] <file>
        - The 'add <file>' command will add team configuration from the
          specified <file>. Existing team configuration will be preserved and
          a new team(s) will be added to the system from the configuration file.
        - This command is only available if the active selection is a team
          and/or in the teamview view.
	    - '-h' option is needed if there is no team selected and application
          need to know which host the teams will be added to.
          
        Example:
        1) add "c:\test.txt"

    adddiscoveryportal  {-m <iSCSI HBA MAC Address>} {-i <TargetPortalAddress>} 
                        {-if <iface file name>}
                        [-n <TargetPortalSocket>] [-mu]
                        [-u <CHAP name>] [-p <CHAP secret>]
                        [-iu <Initiator CHAP name>] [-ip <Initiator CHAP secret>]
        - will add a static target portal to the list of target portals 
	  to which the iSCSI initiator service transmits SendTarget requests.
        - if a value was not specified for the -n option, the default 3260
          port number will be used.
        - If CHAP name and CHAP secret are both not empty, then CHAP
          authentication will be used for login.
        - '-if' only applies to Linux hosts.
        - '-mu' specifies Mutual CHAP Authentication type is used.
        - adddiscoveryportal command is available in the context of a host.

    addhost < [ < localhost | <local host name> | <local host IP> ] |
              [ -p <password> <host name | IP address> ] >
              [ [-protocol <rpc | local>]
              [-persist]
        -p <password> is used to specify qlnxremote agent password. 
        [-protocol <rpc | local>] option is used to specify connection protocol.
            'rpc' is remote procedure call, 'local' is direct calls on the local system.
        'host name' is the name of a host to be connected.
        'IP address' is the IP address of a host to be connected.
        [-persist] option indicates the host information will be saved to the persistent hosts 
           file when user closes qcscli application with "-q" command. All the hosts in the saved
           file will be automatically connected when QCSCLI starts. Use Ctrl+break to break the 
           operation of connecting to the persistent remote hosts.  

    addisnsserver {-i <iSNS Server Address>}
        - will add the iSNS server as identified by the '-i' option
          input parameter.
        - addisnsserver command is available in the context of a host. 
        
    addtarget {-t <TargetName>} {-i <TargetPortalAddress>} {-n <TargetPortalSocket>} 
              [-f <IfaceName>]
        - adds the specified target to the list of static targets.
        - [-f <IfaceName>] specifies the Iface file name to which the static target 
          will be added. This option only applies to Linux hosts.  
        - addtarget command is available in the context of a host. 
        
    bootcfg [-t {iSCSI | fcoe | mba}] 
            [-o show [General | Initiator | Target | MPIO]]
            [-o {save <filename.xml> | restore <filename.xml>}]
        
        - this command will only be available in the context of a physical port
        - this command displays the current iSCSI/FCoE/MBA boot configuration or one of 
          its sub-category boot configuration, 
          or saves the current iSCSI/FCoE/MBA boot configuration to a file,
          or restores the iSCSI/FCoE/MBA boot configuration from a file.
        - the format of the file is xml.

    cablediag
        - The 'cablediag' command will run cable diagnostic tests on the
          selected device.
        - This command is available on a Qlogic based Network physical port device.
        - Ctrl+break to stop the test.

    cfg Advanced [[default]|[parameter]|[parameter=value]]
        - The 'cfg Advanced' command is to get/set advanced parameters 
          of the device.
        - The 'cfg Advanced default' command is to set all advanced parameters
          to their default values.
        - Both parameter and value are case insensitive and have to be 
          specified within the double quotes. If it doesn't has any space 
          or special characters inside, double quotes is optional. If 
          value has special character such as '&', a double quote can be 
          used around '&'.
        - No space is allowed around the '=' in the 'parameter=value'.
        - The 'cfg Advanced' command will display all advanced parameters
          and their current settings.
        - The 'cfg Advanced parameter' will display the current setting
          and all valid settings of the specified parameter.
        - The 'cfg Advanced parameter=value' will set the specified value
          to the specified parameter.
        - The parameter specified has to be one of those parameters that are
          displayed by the 'cfg Advanced' command.
        - The value specified has to be one of the valid settings of the
          parameters that are displayed by the 'cfg advanced parameter'.
        - This command is available if the actively selected device is a 
          NDIS device.
          
        Example:
        1) cfg Advanced "Flow Control"="Auto"
        2) cfg Advanced
        3) cfg Advanced "Flow Control"

    cfg Power [value]
        - The 'cfg Power' command is to get/set Power Management of the device.
        - The 'value' is case insensitive and has to be specified within the
          double quotes. If it doesn't have any space or special characters, 
          double quotes is optional.
        - The 'cfg Power' command will display the current setting of the Power
          Management.
        - The 'cfg Power value' will set the Power Management setting to the
          specified value.  The <value> can be either 'Enable' or 'Disable'.
        - This command is only available if the actively selected device is a 
          NDIS device and is Power Management capable.

    cfg Licenses
        - The 'cfg Licenses' command will display all Licenses parameters and
          their current settings.
        - This command is only available if the actively selected device is a 
          VBD device and belongs to Network family of devices.

    cfg iSCSIMgmt {{-a|-e|-d} <IFace file name>}
                  [[-dhcp4 | -dhcp6] |
                   [{-ipv4 | -ipv6} <IP address>]
                   [-m <Subnet mask>]
                   [-p <Subnet Prefix Length>]
                   [-i <Initiator name>]
                   [-v <VLAN ID>]
                   [-n <IFace NUM>] ]
                   [-mtu < IFace MTU> ]

        - This variant of 'cfg iSCSIMgmt' command is used to manage and edit
          IFace files in Linux host.
        - Both key and value are case insensitive except <Initiator name> and
          have to be specified within the double quotes. If it doesn't have any
          space or special characters inside, double quotes is optional.

        The command options are listed as following:

          -a <IFace file name> is used to add new IFace file.

          -e <IFace file name> is used to edit existing IFace file.

          -d <IFace file name> is used to delete existing IFace file.

        The 'add' and 'edit' commands have the following options:

          -dhcp4 is used to enable DHCP for IPv4 configuration.

          -dhcp6 is used to enable DHCP for IPv6 configuration.

          -ipv4 <IP address> is used to set or modify IPv4 address.

          -ipv6 <IP address> is used to set or modify IPv6 address.

          -m <Subnet mask> is used to set or modify Subnet mask for
           IPv4 configuration.

          -p <Subnet Prefix Length> is used to set or modify Subnet Prefix
           Length for IPv6 configuration.

          -i <Initiator name> is used to set or modify Initiator name.

          -v <VLAN ID> is used to set or modify Vlan ID in IFace file.
           The <VLAN ID> is the range of 0 - 4094.

          -n <IFace NUM> is used to set or modify IFace Number in IFace file.
           The <IFace NUM> is a integer started from 0.

          -mtu < IFace MTU> is used to set or modify MTU for iface file.Range is 1500 to 9600.


        Example:
        1) cfg iSCSIMgmt -a new_dhcp_ipv4 -dhcp
        2) cfg iSCSIMgmt -d bnx2i.00:10:18:a7:1b:11_2001::3742
        3) cfg iSCSIMgmt -e dhcpv6 -v 10 -n 55
        4) cfg iSCSIMgmt -e -mtu 3000

    cfg iSCSIBoot [[key]|[key=value]]
        - The 'cfg iSCSIBoot' command is to get/set iSCSIBoot keys of 
          the device.
        - Both key and value are case insensitive and have to be specified 
          within the double quotes. If it doesn't have any space or special 
          characters, double quotes is optional.
        - No space is allowed around the '=' in the 'key=value'.
        - The 'cfg iSCSIBoot' command will display all iSCSIBoot keys
          and their current settings.
        - The 'cfg iSCSIBoot key' will display the current setting
          and all valid settings of the specified key.
        - The 'cfg iSCSIBoot key=value' will set the specified value to
          the specified key.
        - This command is only available if the actively selected device is a 
          NDIS device and the system is on a iSCSI boot using the selected
          NDIS device.

        The 'cfg iSCSIBoot' use <key> and <value> to configure the iSCSI
        Management parameters.  The use of <key> and its valid <value> are
        listed as following:

        - The <key> 'CDUMP' is used to set the "iSCSI Crash Dump".  The <value>
          can be either 'Enable' or 'Disable'.
          
        Example:
        1) cfg iSCSIBoot CDUMP=Enable

    cfg StorageMgmt [[key]|[key=value]]
        - The 'cfg StorageMgmt' command is to get/set storage personality of 
          the device.
        - Both key and value are case insensitive and have to be specified 
          within the double quotes. If it doesn't have any space or special 
          characters, double quotes is optional.
        - No space is allowed around the '=' in the 'key=value'.
        - The 'cfg StorageMgmt' command will display all storage configuration 
          key and their current setting.
        - The 'cfg StorageMgmt key' will display the current setting
          and all valid settings of the specified key.
        - The 'cfg StorageMgmt key=value' will set the specified value to
          the specified key.
        - This command is only available if the actively selected device is a 
          VBD device and the device support this feature.
		
		- This command is only applicable for E3 Family adapters in SF mode. 
		  For E4/NPAR mode configuration, please use "cfg multi-function" command at Adapter Level.
		  

        The 'cfg StorageMgmt' use <key> and <value> to configure the storage
        configuration parameters.  The use of <key> and its valid <value> are
        listed as following:

        - The <key> 'STORAGEPER' is used to set the "Storage Personality".  
          The <value> can be either 'FCoE' or 'iSCSI'.
          
        Example:
        1) cfg StorageMgmt STORAGEPER=FCoE

    cfg OOBMgmt [-ipv4|ipv6|hostname] [[key]|[key=value]]
        - The 'cfg OOBMgmt' command is to get/set OOBMgmt keys of the 
          selected device.
        - Both key and value are case insensitive and have to be specified 
          within the double quotes. If it doesn't have any space or special 
          characters, double quotes is optional.
        - No space is allowed around the '=' in the 'key=value'.
        - This command is only available if the actively selected device is a 
          NDIS device and is out-of-band management capable.
        - The option '-ipv4|ipv6|hostname' is used to set the value of property
          'Management Console Address'. Among them,
             -ipv4     : verify the input value with IPv4 format
             -ipv6     : verify the input value with IPv6 format
             -hostname : verify the input value with hostname format
             When none of the above options is given, it will be treated as the
             option "-hostname" is given.
          In addition, it will be ignored when one these options is put with other
          parameter together, and no error occurs.

        Example:
        1) cfg OOBMgmt 
        2) cfg OOBMgmt "Heartbeat Retransmit Interval"
        3) cfg OOBMgmt "Heartbeat Retransmit Interval"=200
        4) cfg OOBMgmt "Management Console Address"=10.2.2.1
        5) cfg OOBMgmt -ipv4 "Management Console Address"=10.2.2.1

            
    cfg iSCSIInitiator [value]
        - The 'cfg iSCSIInitiator' command is to display the name of iSCSI
          Initiator of the system. 
        - The 'cfg iSCSIInitiator name' command is to set the name of iSCSI
          Initiator of the system. 

    cfg iSCSISecret <value>
        - The 'cfg iSCSISecret" command is to set the CHAP secret of iSCSI
          Initiator of the system. 

    cfg dcbx [ [-c <filename>] | [-s <filename>] ]
        - The 'cfg dcbx' command is to configure DCBX settings on the selected
          physical port device.
        - cfg dcbx will display the current configuration.
        - cfg dcbx -s filename will save the current configuration into a
          XML file.
        - cfg dcbx -c filename will configure the dcbx settings from the
          specified XML file. 
        - This command is only available if the actively selected device is a 
          physical port and dcbx configuration is allowed (like in 10G devices).
          
    cfg Advanced [[key]|[key=value]] under FCoE device level
        - The 'cfg Advanced' command is used to configure FCoE settings.
        - Both key and value are case insensitive and have to be specified 
          within the double quotes. If it doesn't have any space or special 
          characters, double quotes is optional.
        - No space is allowed around the '=' in the 'key=value'.
        - This command is only available if the actively selected device is a 
          FCoE device.

    cfg [ vlan | -[s|c|o] <filename> ]

        - The 'cfg vlan' command is used to configure physical adapter
          vlan settings.
        - 'cfg vlan' will display the current configuration.
        - 'cfg vlan -s <filename>' will save the current configuration into 
          a XML file.
        - 'cfg vlan -c <filename>' will configure the VLAN settings 
          from the specified XML file. 	
	- This command supports only E3 Family of Adapters.
        - The XML file needs to be edited and desired values needs to be set before configuring.
           NOTE: The 'VLAN_IDPool' should be in string format representing the bitmap to be set.
           E.g  ...<VLAN_IDPool>2 3 4 6-18></VLAN_IDPool>...

		  
    cfg [ Multi-Function ["Multi-Function mode" | -[s|c|o] <filename> |
                         -p port# [-f function#] key]
          | [SRIOV [ -s <filename> | -c <filename>] ]
        - The 'cfg Multi-Function' command is used to configure physical adapter
          nic partition settings.
        - 'cfg Multi-Function' will display the current configuration.
        - 'cfg Multi-Function -s <filename>' will save the current configuration into 
          a XML file.
        - 'cfg Multi-Function -c <filename>' will configure the NIC settings 
          from the specified XML file. 
        - 'cfg multi-function -o <filename>' will configure the NIC settings 
          from the specified XML file. This option will overwrite SRIOV configuration 
          if there is any conflict between Multi-function config and SRIOV config.
        - use 'cfg Multi-Function -c <filename>' to disable Multi-Function by setting 
          <MultiFunctionMode> to SingleFunction. Refer to 
          section 8.2.2 & 8.2.3.
        - cfg multi-function -p 0 -f 2 \"FCoE\" will display port0 function2 FCoE 
          configuration. The default function number is the first function of the
          specified port.
        - The 'cfg SRIOV' command is used to configure physical adapter
          SRIOV settings.
        - 'cfg SRIOV' will display the current configuration.
        - 'cfg SRIOV -s <filename>' will save the current configuration into 
          a XML file.
        - 'cfg SRIOV -c <filename>' will configure the SRIOV settings 
          from the specified XML file. 
        - All keys and operands are case insensitive.
          valid key:
            "Multi-Function mode", -p and -f options not required.
            "FlowControl"
            "Ethernet/Ndis"
            "iSCSI"
            "FCoE"
            "MaxBandwidth"
            "RelativeBandwidth"
            "AFEX VIF Profile"
            "AFEX VIF Profile List", -f option not required
			
			
		- This command supports both SF/NPAR modes for E4 Family of Adapters.
		  For E3 : NPAR mode, same command can be used to display/configure.
		  For E3 : SF mode , please use "cfg Resource/StorageMgmt" command at VBD level to configure resources.
		  
		  
		  
	upgrade {-mbi <filepath and name>}
	Example: 
		upgrade -mbi C:\ql_mbi_81521.bin
	
	NOTE: After upgrade, perform 'refresh' command at host level to check the updated  MBI version in 'info' command at Adapter level.
	
    createnpivport {-s <x:xx>} | {-p <WWPN>}
        - <WWPN> : World Wide Port Name. It consists of 16 hexadecimal digits, grouped as 8 pairs.
		           Example for the WWPN is 21:00:00:e0:8b:05:05:04 (Qlogic FCoE HBA Card).
        - <x:xx> : It indicates the only 3 digits (1-3) of current WWPN. For example: Only <x:xx> part in WWPN - 2x:xx:00:10:18:aa::bb::cc
		
        - '-s'   : Safe Mode, in this mode, only 3 digits (1-3) of current WWPN (only <x:xx> part) will be allowed to change.
                   Other digits will be taken automatically from the current WWPN.
                   For example: createnpivport -s x:xx  
        - '-p'   : Expert Mode, in this mode, The complete WWPN (World Wide Port Name) will be passed.
                   For example: createnpivport -p 21:00:00:e0:8b:05:05:04
        - This command is available in the context of a FCoE HBA selection.
        - Creates a NPIV port.

    createmultinpivport {{-s <x:xx>} {-e <x:xx>} {-n <num>}}
        - '-s': starting name range, only 3 digits(1-3) allow to change. 
                For example: 2x:xx:00:10:18:aa::bb::cc
                Other digits are from current WWPN/WWNN.
        - '-e': ending name range, only 3 digits(1-3) allow to change. 
                For example: 2x:xx:00:10:18:aa::bb::cc
                Other digits are from current WWPN/WWNN.
        - '-n': Number of NPIV ports need to be created.
        - this command is available in the context of a FCoE HBA selection
        - creates multiple NPIV ports at the same time.
        
    diag {[-c REG ] [-c MII ] [-c EEP] [-c MEM] [-c CPU] [-c INT] [-c MACLB ]
          [-c PHYLB] [-c LED] | [-c ALL]} [-l <cnt> ] [ -v <LEDIntv> ]

        - The 'diag' command is to configure the parameters of the Diagnostic
          test and run the test.
        - The 'diag' command will display all the tests available for the 
          current selected target if no option is specified.
        - If '-l' is not specified, the default iteration will be 1.
        - If '-v' is not specified, the default LED interval will be 5.
        - This command is available on a QLogic based Network physical port device.
        - Ctrl+break to stop the test.
         
        Each individual test is indicated by the option as following:
        - The '-c REG' is to run Control Register test.
        - The '-c MII' is to run MII Register test.
        - The '-c EEP' is to run EEPROM test.
        - The '-c MEM' is to run Internal Memory test.
        - The '-c CPU' is to run OnChip CPU test.
        - The '-c INT' is to run Interrupt test.
        - The '-c MACLB' is to run MAC Loopback test.
        - The '-c PHYLB' is to run PHY Loopback test.
        - The '-c LED' is to run LED test with the LEDIntv value.
        - The '-c ALL' is to run all the above tests.
        
        Example:
        1) diag -c ALL -l 3 -v 5
        2) diag -c CPU -c LED -v 5

    discoverhost -s <start IP address> -e <end IP address>
                 -p <password> 
                 [-protocol <rpc | local>]
                 [-persist]
        -s <start IP address> is used to specify the starting IP address of searching range.
        -e <end IP address> is used to specify the ending IP address of searching range.
        -p <password> is used to specify qlnxremote agent password. 
        [-protocol <rpc | local>] option is used to specify connection protocol.
            'rpc' is remote procedure call, 'local' is direct calls on the local system.
        'host name' is the name of a host to be connected.
        'IP address' is the IP address of a host to be connected.
        [-persist] option indicates the host information will be saved to the persistent hosts 
            file when user closes qcscli application with "q" command. All the hosts in the saved 
            file will be automatically connected when QCSCLI starts.
        Ctrl+break to stop the operation.

          
    help
        list of available commands
        
    info [ all | vitalsigns | driver | eee | hardware | resource | os | initiator | dcbx | 
         nicpartition | system | hwinventory | swinventory | switch | vf ] [-a]
        Display adapter information of the selected NIC.
        This version of the 'info' command is available 
        if the actively selected device is a NDIS device.
        - all       : display information of all categories
        - vitalsigns: display 'Vital Signs" information
        - driver    : display 'Driver' information
        - eee       : display 'EEE' information
        - hardware  : display 'Hardware' information
        - resource  : display 'Resource' information
        - os        : display host OS information
        - initiator : display iSCSI initiator information
        - dcbx      : display dcbx information
        - switch    : display SRIOV switch information
        - vf        : display SRIOV vf information
        - nicpartition : display nic partition information
        - [-a] option is used to display more DCBX advanced information under phyport device, it only
          applies to all or dcbx.
        * The following comamand option only aaliable on on trumanage view or trumanage target is selected.
        - system      : display system details information for TruManage target
        - 'switch' and 'vf' options are for VBD devices on windows hosts or
          l2nic devices on LINUX hosts.
       
        
        Example:
        1) info all
        2) info vitalsigns
        3) info dcbx -a
        
    info
        Display adapter information of the selected team in 
        either the "teamview" view.

    list [-f MAC|BDF] [-r] [-h <host>][<view>]
        Lists the target items in different views. 
        
        Note: 
        * If '-f MAC' option is used, devices will be identified using 
          the MAC address.
        * If '-f BDF' option is used, devices will be identified using 
          the bus/device/function numbers, the bus/device/function numbers 
          are in HEX format. 
        * If -f option is not specified, the default behavior is to 
          identify devices using MAC address.
        * '-f MAC' option is not applicable to hosts, phyadapters & phyports 
          devices because a single MAC address does not applicable to them.
        * The '-h' option is useful in most of the commands. If specified,
          the view will only reflect the target list corresponding to 
          the specified host.
        * The '-r' option forces to reconnect, it is only valid when 'hosts' is 
          used. This option is useful when users want to reconnect to a host which 
          is recovered from reboot or linkdown.
        * The 'list' command is available in all views.
        * Ctrl+break to stop the operation.
        
        The available views are defined as following:
        - devcon       : list devices by connection
        - ndis         : list NDIS devices
        - iSCSI        : list iSCSI devices
        - fcoe         : list FCoE devices
        - iSCSItargets : list iSCSI targets
        - fcoetargets  : list FCoE targets
        - phyadapters  : list physical adapters on the system
        - phyports     : list physical ports on the system
        - hosts        : list the connected hosts
        - luns         : list the LUNs
        - iSCSIportal  : list iSCSI portal devices
        - fcport       : list FC port devices
       
        Example:
        1) list -f MAC <view> 
	    e.g. list -f MAC iscsi 
	
	2) list -f BDF <view>
	    e.g. list -f BDF devcon
   
    listisnsservers
        - displays list of iSNS servers.
        - listisnsservers command is available in the context of a host.
        
    listdiscoveryportals {-h <host>}
        - will display the list of persisted target portals that the iSCSI 
          initiator service will use for discovery for the specified host.
        - listdiscoveryportals command is available in the context of a host.

    log [<file>]
        'file' is the log file name to save all the input and output.
        Without 'file', the current log file is closed. This command 
        is available in all views.

    login {-m <iSCSI HBA MAC Address>} {-t <TargetName>} 
          [-h <host>] [-i <TargetPortalAddress> ] [-n <TargetPortalSocket>]
          [-u <CHAP name>] [-p <CHAP secret>] 
          [-iu <Initiator CHAP name>] [-ip <Initiator CHAP secret>]
          [-if <iface file name>]
          [-b] [-e] [-d] [-o] [-mu]
        - login command is available in the context of a host, in the
          context of a iSCSI device or in the context of a iSCSI Target. 
        - '-h' is only required when command is using on iSCSI target context,
          because a target might connect to HBA on different host.
        - '-i' is an optional parameter. If '-i' option was specified, it 
          mandatory to specify the '-n' option as well. That is, if the 
          target portal IP address was specified, it is mandatory to
          specify the target port number as well.
        - login operation will be performed using the HBA identified by
          the '-m' parameter and the target (identified by the '-t
          parameter) and the target portal address, and iface file name 
          identified by '-if' parameter.
        - If CHAP name and CHAP secret are both not empty, then CHAP
          authentication will be used for login.
        - using '-b' option specify whether the connection should persist
          across reboot sessions.
        - using '-e' option specify use header digest for login.
        - using '-d' option specify use data digest for login.
        - using '-o' option specify enable MPIO.
        - using '-mu' option specify Mutual CHAP Authentication type.
        - '-if', '-iu' and '-ip' only apply to Linux hosts.
          
    logout {-s <SessionId>} [-h <host>]
        - logout command is available in the context of a host or
          in the context of a iSCSI device or in the context of a iSCSI Target. 
        - '-h' is only required when command is using on iSCSI target context,
          because a target might connect to HBA on different host.
        - logout operation will be performed on the specified session.
          
    networkdiag [-p <ipaddr>]
        - The ''networkdiag' will run network diagnostic test on
          the selected device.
        - The '-p <ipAddr> is the IP address used for the test, if this option 
          is not specified, test will use the IP address found in the Gateway
          IP addresses list.
        - This command is available on all NDIS device selections.
        - Ctrl+break to stop the test.
        
        Example:
        1) networkdiag -p 10.10.10.10

    
    q
       exit the program
       
    refresh        
        - scans the system for hardware/configuration changes
        - This command is only available in host views.
        
    refreshall        
        - scans all systems for hardware/configuration changes
        - This command is only available in host views.
        - Ctrl+break to stop to the operation.

    refreshdiscoveryportal  {-m <iSCSI HBA MAC Address>} {-i <TargetPortalAddress>} 
                    [-n <TargetPortalSocket>]
        - will perform a SendTargets operation to the target portal and include 
          the discovered targets into the list of targets maintained by the service
        - refreshdiscoveryportal command is available in the context of a host.
        - if a value was not specified for the -n option, the default 3260
          port number will be used.

    refreshisnsserver {-i <iSNS Server Address>}
        - will refresh the list of targets discovered from the specified iSNS server
        - refreshisnsserver command is available in the context of a host. 
        
           
    removeallhosts
        Example:
        1) removeallhosts
     
    removediscoveryportal  {-m <iSCSI HBA MAC Address>} {-i <TargetPortalAddress>} 
                    [-n <TargetPortalSocket>]
        - will remove a portal from the list of portals that iSCSI initiator service 
          sends SendTargets request to discover targets.
        - removediscoveryportal command is available in the context of a host.
        - if a value was not specified for the -n option, the default 3260
          port number will be used.

    removehost  <host name | IP address>
        'host name' is the name of a host to be disconnected.
        'IP address' is the IP address of a host to be connected.

    removeisnsserver {-i <iSNS Server Address>}
        - will remove the iSNS server as identified by the '-i' option
          input parameter.
        - removeisnsserver command is available in the context of a host. 
    
    removenpivport  {-p <WWPN>}
        - this command is available in the context of a FCoE HBA selection
        - removes a NPIV port
          
    removemultinpivport {{-s <x:xx>} {-e <x:xx>}}
        - '-s': starting name range, only 3 digits(1-3) allow to change. 
                For example: 2x:xx:00:10:18:aa::bb::cc
                Other digits are from current WWPN/WWNN.
        - '-e': ending name range, only 3 digits(1-3) allow to change. 
                For example: 2x:xx:00:10:18:aa::bb::cc
                Other digits are from current WWPN/WWNN.
        - this command is available in the context of a FCoE HBA selection
        - remove multiple NPIV ports at the same time.

    removepersistenttarget  {-t <TargetName>} [-h <host>]
        - removepersistenttarget command is available in the context of a host
          or in the context of a iSCSI Target. 
        - will remove a target from the list of persistent targets.
        - '-t' is only required when command is using on host context, in context
          of a iSCSI Target '-t' option must no exist.
        - '-h' is only required when command is using on iSCSI target context,
          because a target might connect to HBA on different host.
          
    removetarget {-t <TargetName>}
        - will remove the static target as identified by the '-t' option
          input parameter.
        - removetarget command is available in the context of a host. 
    
    resetsessionstats [<sessionid>]
        - reset statistics information of all sessions or 
          for a specified session.
        - If 'sessionid' was specified, the statistics for that session 
          will be reset
        - This command is only available if the active selection is a iSCSI
          device.

    resetstats
        - The 'resetstats' command will reset the statistics of the selected
          device.
        - This command is available in all context where the 'stats' command
          is applicable. 

    restore [-h <host>] <file>
        - The 'restore <file>' will restore team configuration from the 
          specified <file>. Existing team configurations will be lost.
        - This command is only available if the active selection is a team
          and/or in the teamview view.
	    - '-h' option is needed if there is no team selected and application
          need to know which host the teams will be restore to.
          
        Example:
        1) restore "c:\test.txt"

      
    select [<index>]
        select a target from current view or display the selected
        target in the current view if <index> is not specified.
        This command is available in all views.

    sessions    
        - displays list of iSCSI sessions on the selected iSCSI adapter.
        - This command is only available if the actively selected device
          is an iSCSI device.
          
    sessionstats [<sessionid>]
        - display statistics information of all sessions or 
          for a specified session.
        - If 'sessionid' was specified, the statistics for that session 
          will be displayed
        - This command is only available if the active selection is a iSCSI
          device.

    showsel
        show the selected target item

    stats [all | general | IEEE | custom | qlasp]
        - The 'stats' command will display statistic information of the
          selected device.
        - This command is available on all NDIS device selections.
          
        Example:
        1) stats
        2) stats all
        3) stats qlasp
   
    stats [all | custom | switch | vf ]
        - The 'stats' command will display statistic information of the
          selected device.
        - This command is available on all VBD device selections.
        - 'switch' option will display SRIOV switch statistics
        - 'vf' option will display SRIOV VF statistics
        - 'switch' and 'vf' options are for VBD devices on windows hosts or
          l2nic devices on LINUX hosts.
  
        Example:
        1) stats
        2) stats all
        3) stats switch
        4) stats vf
       
    stats [all | login | instance | custom]
        - If 'login' argument was specified, the stats command will
          display login statistics of the selected iSCSI adapter.
        - If 'instance' argument was specified, the stats command will
          display instance statistics of the selected iSCSI adapter.
        - If 'custom' argument was specified, the stats command will
          display the custom statistics of the selected iSCSI adapter.
        - If the 'all' option was specified, the stats command will
          display all the statistics information for the selected iSCSI adapter.
        - If the no parameter was specified, the stats command will
          display all the statistics information for the selected iSCSI adapter.
        - This command is available on all iSCSI device selections. 

           
     version                
        display the version of this program


9. How-To and Examples:
=====================
    8.1 How to enter into Interactive mode?
    - Enter 'QCScli' without additional parameter will enter into Interactive
      mode of QCScli.

      Example:
      1. 'QCScli' will enter into interactive mode.

    8.2 How to exit from Interactive mode?
    - Enter 'q' command while in the Interactive mode of QCScli.

      Example:
      1. 'q' will exit from Interactive mode.

    8.3 How to list target adapters of different view in the Command Line
        Interface mode?
    - In Command Line Interface mode, use 'QCScli list <view>' command to list
      all the target adapters of the desired <view>.

      Examples:
      1. 'QCScli list NDIS' will list all NDIS adapters in the system.
      2. 'QCScli list devcon' will list all adapters by connection.
      
    8.4 How to obtain context help for each command?
    - In interactive mode, the keyword "help" or "?" is applicable to show
      help for its particular command. 
      
      Examples:
      1. 'cfg help' will display help text for the configuration for the 
         selected device
      2. 'info ?' will display help text for the information of the selected
         adapter
      
    - In the command line interface mode, use the following syntax to obtain the 
      help text for a specific operation
      
      Examples:
      1. 'QCScli -t NDIS -f mac -i 0010181a1b1c "info help"' will display all the
         help text for the information of the selected NDIS adapter.
      2. 'QCScli -t NDIS -f mac -i 0010181a1b1c "cfg help"' will display help for 
         the configuration of the selected NDIS adapter.

    8.5 How to switch between different view of target adapters in Interactive
        mode?
    - In Interactive mode, use the 'list [-f MAC|BDF] [<view>]' 
      command to switch between different view of target adapters.  
      The default view of the QCScli is 'devtype' in the Interactive mode.  
      All target adapters of the selected view are listed and the 
      selected default adapter is high-lighted.

      Examples:
      1. 'list -f MAC NDIS' will list all NDIS devices that are present 
         in the system with MAC address as identifiers.
      2. 'list -f BDF NDIS' will list all NDIS devices that are present 
         in the system with Bus/Device/Function numbers as identifiers,
         the Bus/Device/Function numbers are in HEX format.
      3. 'list -f MAC devcon' will list all adapters by the connection
         identifying devices using their MAC address.
      4. 'list -f BDF devcon' will list all adapters by the connection
         identifying devices using their Bus/Device/Function address,
         the Bus/Device/Function numbers are in HEX format.
         
   - In the command line interface mode, use the following syntax to 
     list devices in different views:
     'QCScli "list [-f MAC|BDF][<view>]"'
     
     Examples:
      1. QCScli "list -f MAC NDIS" will list all NDIS devices that are present 
         in the system with MAC address as identifiers.
      2. QCScli "list -f BDF NDIS" will list all NDIS devices that are present 
         in the system with Bus/Device/Function numbers as identifiers,
         the Bus/Device/Function numbers are in HEX format.
      3. QCScli "list -f MAC devcon" will list all adapters by the connection
         identifying devices using their MAC address.
      4. QCScli "list -f BDF devcon" will list all adapters by the connection
         identifying devices using their Bus/Device/Function address,
         the Bus/Device/Function numbers are in HEX format.

    8.6 How to select a target for the command to operate on in CLI mode?
    - In Command Line Interface mode, use the -t, -f, and -i option to uniquely
      select the target for the following <command string> to operate on it.

      Examples:
      1. 'QCScli -t NDIS -f mac -i 0010181a1b1c info' will display the adapter
         information of the selected NDIS adapter whose current MAC address
         is 00:10:18:1a:1b:1c.
      2. 'QCScli -t VBD -f mac -i 0010181a1b1d info' will display the adapter
         information of the selected VBD adapter whose current MAC address
         is 00:10:18:1a:1b:1d.
      3. 'QCScli -t iSCSI -f mac -i 0010181a1b1e info' will display the 
         adapter information of the selected iSCSI adapter whose current 
         MAC address is 00:10:18:1a:1b:1e.
      6. 'QCScli -t VNIC -f name -i VLAN1 "info"' will display the virtual
         adapter information which is identified by a VLAN name ('VLAN1').
      
      
    8.7 How to select a target in the Interactive mode?
    - In Interactive mode, use the 'select [<index>]' command to select 
      the target from the target adapters of current view.  
      Use the 'showsel' command to display the selected target adapter.  
      Any command entered at this point will apply to the selected target 
      adapter.

      Examples:
      1. 'list NDIS' and 'select 3' will select the 3rd adapter from the list 
         of all target adapters of NDIS view.
      2. 'list devcon' and 'select 5' will select the 5th adapter from the list 
         of all target adapters of devcon view.

    8.8 How to get information of a selected target?
    - In CLI mode, use 'QCScli -t <target type> -f <format> -i <target ID>
      info [ all | vitalsigns | driver | hardware | resource ]' command to get
      information of the selected target.
      This command is available for NDIS, VBD and team.

      Examples:
      1. 'QCScli -t NDIS -f mac -i 0010181a1b1c "info"' will display all the
         information of the selected NDIS adapter.
      2. 'QCScli -t NDIS -f mac -i 0010181a1b1c "info vitalsigns"' will 
         display the 'Vital Signs' information of the selected NDIS adapter.
      3. 'QCScli -t NDIS -f mac -i 0010181a1b1c "info resource"' will display
         the 'Resources' information of the selected NDIS adapter.
      4. 'QCScli -t VBD -f mac -i 0010181a1b1d "info driver"' will display
         the 'driver' information of the selected VBD adapter.
      5. 'QCScli -t NDIS -f mac -i 0010181a1b1c "info hardware"' will display
         the 'hardware' information of the selected NDIS adapter.
      6. 'QCScli -t NDIS -f mac -i 0010181a1b1c "info all"' will display all 
         the information of the selected NDIS adapter
      7. 'QCScli -t VNIC -f name -i "^"VLAN1 "info"' will display the virtual
         adapter information which is identified by a VLAN name ('^VLAN1').
         If VLAN name contains special character, it needs to be specified 
         inside double quotes.
      

    - In Interactive mode, use 'list <view>' and 'select <idx> commands to 
      select the desired target device.  
      Use 'info [ all | vitalsigns | driver | hardware | resource ]' 
      command to get information of the selected target.

      Examples:
      1. 'info' or 'info all' will display all the information about 
         the selected target.
      2. 'info vitalsigns' will display vitalsigns information of the 
         selected target.
      3. 'info resource' will display vitalsigns information of the 
         selected target.
      4. 'info driver' will display vitalsigns information of the 
         selected target.
      5. 'info hardware' will display vitalsigns information of the 
         selected target.
      6. 'info' will display the information of the selected team.
      
    8.9 How to configure 'Advanced parameter' of a selected target?
    - In CLI mode, use 'QCScli -t <target type> -f <target format> 
      -i <target ID> cfg Advanced [param|param=value]' command to display 
      and configure the 'Advanced parameter' of the selected target.

      Examples:
      1. 'QCScli -t NDIS -f mac -i 0010181a1b1c "cfg Advanced"' will 
         display all Advanced parameters of the selected NDIS adapter 
         and their current settings.

      2. 'QCScli -t NDIS -f mac -i 0010181a1b1c "cfg Advanced \"802.1p QOS\""' 
         will display the current setting and all valid settings of the 
         specified Advanced parameter "802.1p QOS".

      3. 'QCScli -t NDIS -f mac -i 
         0010181a1b1c "cfg Advanced \"802.1p QOS\"=\"Enable\""'
         will set the Advanced parameter, '802.1p QOS', to 'Enable'.

      4. 'QCScli -t NDIS -f mac -i 
         0010181a1b1c "cfg advanced \"Flow Control\"=\"Rx "&" Tx enabled\""'
         will set the Advanced parameter, 'Flow Control', to 'Rx & Tx enabled'.


    - In Interactive mode, use 'list <view>' and 'select <idx> commands to 
      select the desired target device.  Use 'cfg Advanced [param|param=value] 
      to display and configure the 'Advanced parameter' of the selected target.

      Examples:
      1. 'cfg Advanced' will display all Advanced parameters of the selected
        adapter and their current settings.

      2. 'cfg Advanced "802.1p QOS"' will display the current setting and all
        valid settings of the "802.1p QOS" Advanced parameter.

      3. 'cfg Advanced "802.1p QOS"="Disable"' will set the "802.1p QOS"
       parameter to be "Disable".

    8.10 How to display 'Licenses' of a selected target?
    - In CLI mode, use 'QCScli -t <target type> -f <target format> 
      -i <target ID> cfg licenses' command to display the 'Licenses' of the 
      selected target.

      Examples:
      1. 'QCScli -t VBD -f mac -i 0010181a1b1d "cfg Licenses"' will display 
         all Licenses of the selected VBD adapter and their current settings.

     
    - In Interactive mode, use 'list <view>' and 'select <idx> commands to
      select the desired target device.  Use 'cfg Licenses' command to
      display the Licenses of the selected target.

      Examples:
      1. 'cfg Licenses' will display all Licenses parameters of the selected
         adapter and their current settings.

    8.11 How to configure 'iSCSI parameter' of a selected target?
    - In CLI mode, use 'QCScli -t <target type> -f <target format> 
      -i <target ID> cfg iSCSIMgmt [key|key=value]' command to display 
      and configure the 'iSCSI parameter' of the selected target.

      Examples:
      1. 'QCScli -t iSCSI -f mac -i 0010181a1b1e "cfg iSCSIMgmt"' will
        display all iSCSI Management keys of the selected iSCSI adapter
        and their current settings.

      2. 'QCScli -t iSCSI -f mac -i 0010181a1b1e 
         "cfg iSCSIMgmt \"IPV4DHCP\""' will display the 
         current setting and all valid settings of the IPV4DHCP key.

      3. 'QCScli -t iSCSI -f mac -i 0010181a1b1e 
         "cfg iSCSIMgmt \"IPV4DHCP\"=\"Enable\""' will set the 
         'IPV4DHCP' key to 'Enable'.

    - In Interactive mode, use 'list <view>' and 'select <idx> commands to
      select the desired target device.  Use 'cfg iSCSIMgmt [key|key=value]'
      command to display and configure the 'iSCSI parameter' of the selected
      target.

      Examples:
      1. 'cfg iSCSIMgmt' will display current settings of all iSCSI Management
         parameters of the selected adapter and their current settings.

      2. 'cfg iSCSIMgmt "IPV4DHCP"' will display the current setting
         and all valid settings of the IPV4DHCP key.

      3. 'cfg iSCSIMgmt "IPV4DHCP"="Enable"' will set the "IPV4DHCP" to
         be "Enable".

    8.12 How to configure 'Resource' of a selected target?
    - In CLI mode, use 'QCScli -t <target type> -f <target format> 
      -i <target ID> cfg Resource [key|key=value]' command to display 
      and configure the 'Resource parameter' of the selected target.

      Examples:
      1. 'QCScli -t VBD -f mac -i 0010181a1b1d "cfg Resource"' 
         will display all Resource Reservation keys and their current settings.

      2. 'QCScli -t VBD -f mac -i 0010181a1b1d 
         "cfg Resource \"CONFIGURABLE\""' will display all configurable 
         Resource Reservation keys with their current settings and 
         valid settings.

      3. 'QCScli -t VBD -f mac -i 0010181a1b1d 
         "cfg Resource \"CONFIG\"=\"RSVD\""' will set the 
         "Offload Configuration" to "Reserved Resources".

      4. 'QCScli -t VBD -f mac -i 0010181a1b1d 
         "cfg Resource \"TOECONN\"=\"50\""' will set the 
         "TOE Connections" to 50. The command is valid only 
         when the "Offload Configuration" is in "Reserved Resources".

      5. 'QCScli -t VBD -f mac -i 0010181a1b1d 
         "cfg Resource \"iSCSI\"=\"Disable\""' set the 
         "Pre-Allocated Resources for iSCSI" to Disable.
         All reserved resources for iSCSI is released.
         The command is valid only when the "Offload Configuration" 
         is in "Reserved Resources".

    - In Interactive mode, use 'list <view>' and 'select <idx>' 
      commands to select the desired target device.  
      Use 'cfg Resource [key|key=value]' command to display
      and configure the 'Resource parameter' of the selected target.

      Examples:
      1. 'cfg Resource' will display all Resource Reservation
         parameters of the selected adapter and their current settings.

      2. 'cfg Resource "CONFIGURABLE"' will display all configurable
         Resource Reservation parameters with their current settings
         and valid settings.

      3. 'cfg Resource "CONFIG"="FCFS"' set the "Offload Configuration"
         to "First Come First Served".

      4. 'cfg Resource "iSCSICONN"="20"' set the "iSCSI Connections" to 20.
         The command is valid only when the "Offload Configuration" is in
         "Reserved Resources".

      5. 'cfg Resource "TOE"="Disable"' set the "Pre-Allocated Resources
         for TOE" to Disable.  All reserved resources for TOE is released.
         The command is valid only when the "Offload Configuration" is in
         "Reserved Resources".

    8.13 How to configure 'OOBMgmt' of a selected target?
    - In CLI mode, use 'QCScli -t <target type> -f <target format> 
      -i <target ID> cfg iSCSIMgmt [key|key=value]' command to display 
      and configure the 'iSCSI parameter' of the selected target.
      
      Examples:
      1. 'QCScli -t NDIS -f mac -i 0010181a1b1c "cfg OOBMgmt"' will 
         display all OOB Management parameters and their current settings 
         or information
      
      2. 'QCScli -t NDIS -f mac -i 0010181a1b1c "cfg OOBMgmt 
         \"Heartbeat Transmit Interval\""' will display 
         "Heartbeat Transmit Interval" current settings and its valid input.
      
      3. 'QCScli -t NDIS -f mac -i 0010181a1b1c "cfg OOBMgmt 
         \"Heartbeat Transmit Interval\"=\"50\""' will set the 
         "Heartbeat Transmit Interval" to 50 seconds
         
    - In Interactive mode, use 'list <view>' and 'select <idx>' 
      commands to select the desired target device.  
      Use 'cfg OOBMgmt [key|key=value]' command to display and configure 
      the 'OOBMgmt parameter' of the selected target.

      Examples:
      1. 'cfg OOBMgmt' will display all OOB Management
         parameters of the selected adapter and their current settings.

      2. 'cfg OOBMgmt "Heartbeat Transmit Interval"' will display 
         "Heartbeat Transmit Interval" current settings and its valid input
         
      3. 'cfg OOBMgmt "Heartbeat Transmit Interval"="50"' will set the 
         "Heartbeat Transmit Interval" to 50 seconds
         
    8.14 How to configure 'Systoe' of the system?
    - In CLI mode, use 'QCScli -t System "cfg Systoe [value]" command to 
      display and configure the TCP Offload of system chimney.
      
      Examples:
      1. 'QCScli -t system "cfg Systoe"' will display current Chimney 
         Offload State.
      
      2. 'QCScli -t system "cfg Systoe Enabled"' will enable current Chimney 
         Offload State.
      
      3. 'QCScli -t system "cfg Systoe Disabled"' will disable current Chimney 
         Offload State.

      4. 'QCScli -t system "cfg Systoe Automatic"' will set current Chimney 
         Offload State to automatic (Win7 kernel and later).
         
    - In Interactive mode, use 'list System' and by default the system is 
      selected because there is only system.
      Use 'cfg Systoe [value]' command to display and configure 
      the TCP Offload of system chimney.

      Examples:
      1. 'cfg Systoe' will display current Chimney Offload State.

      2. 'cfg Systoe Enabled' will enable current Chimney Offload State.
         
      3. 'cfg Systoe Disabled' will disable current Chimney Offload State.

      4. 'cfg Systoe Automatic' will set current Chimney Offload State
         to automatic (Win7 kernel and later).

    8.15 How to get statistics for a selected target?
    - In CLI mode, use 'QCScli -t <target type> -f <target format> 
      -i <target ID> "stats <options>"'

      Examples:
      1. 'QCScli -t NDIS -f mac -i 0010181a1b1c "stats"' will display
         all statistics of the selected NDIS adapter.
         
      2. 'QCScli -t NDIS -f mac -i 0010181a1b1c "stats general"' will display
         general statistics of the selected NDIS adapter.
         
      3. 'QCScli -t NDIS -f mac -i 0010181a1b1c "stats IEEE"' will display
         IEEE statistics of the selected NDIS adapter.
         
      4. 'QCScli -t NDIS -f mac -i 0010181a1b1c "stats QLASP"' will display
         QLASP statistics of the selected NDIS adapter.

      5. 'QCScli -t NDIS -f mac -i 0010181a1b1c "stats all"' will display
         all the statistics information of the selected NDIS adapter.
         
      6. 'QCScli -t iSCSI -f mac -i 0010181a1b1e "stats login"' will display 
         login statistics information of the selected iSCSI device.
         
      7. 'QCScli -t iSCSI -f mac -i 0010181a1b1e "stats instance"' 
         will display instance statistics information of the selected 
         iSCSI device.
         
      8. 'QCScli -t iSCSI -f mac -i 0010181a1b1e "stats custom"' will display 
         custom statistics information of the selected iSCSI device.
         
      9. 'QCScli -t iSCSI -f mac -i 0010181a1b1e "stats all"' will display
         all the statistics information of the selected iSCSI device.
         
      10. 'QCScli -t iSCSI -f mac -i 0010181a1b1e "stats"' will display 
         all the statistics information of the selected iSCSI device.
         
        
      11. 'QCScli -t VNIC -f name -i asdf "stats"' will display 
         all the statistics information for the virtual adapter whose
         VLAN name is 'asdf'.

    - In Interactive mode, the target type and target identifiers need
      not be specified and the stats command will be based on the active
      target selection.
      
      Examples:
      1. 'stats' will display all statistics of the 
         selected NDIS adapter.
         
      2. 'stats general' will display general statistics of 
         the selected NDIS adapter.
         
      3. 'stats IEEE' will display IEEE statistics of the 
         selected NDIS adapter.
         
      4. 'stats QLASP' will display BASP statistics of the selected 
         NDIS adapter.

      5. 'stats all' will display all the statistics information 
         of the selected NDIS adapter.
         
      6. 'stats login' will display login statistics information 
         of the selected iSCSI device.
         
      7. 'stats instance' will display instance statistics information 
         of the selected iSCSI device.
         
      8. 'stats custom' will display custom statistics information 
         of the selected iSCSI device.
         
      9. 'stats all' will display all the statistics information 
          of the selected iSCSI device.
         
      10. 'stats' will display all the statistics information 
          of the selected iSCSI device.
          
      11. 'stats' will display all the statistics information 
          for the selected team.
         
      12. 'stats' will display all the statistics information 
          for the selected virtual adapter. 

    8.16 How to reset statistics of a selected target?
    - This command is not applicable in the CLI mode.
    
    - In Interactive mode, type 'resetstats' to reset all statistical
      information for a selected/active NDIS/VNIC/iSCSI/team.

    8.17 How to run diagnostic tests of a selected target?
    - In CLI mode, use 'QCScli -t <target type> -f <target format> 
      -i <target ID> "diag {[-c REG ] [-c MII ] [-c EEP] [-c MEM] 
      [-c CPU] [-c INT] [-c MACLB ] [-c PHYLB] [-c LED] | [-c ALL]} 
      [-l <cnt> ] [ -v <LEDIntv> ]"' command to run NIC diagnostics 
      tests for the selected target. This command is available for 
      PHYPORTS device only

      Examples:
      1. 'QCScli -t PHYPORTS -f bdf -i 01:00.00 "diag"' will display all the
         diagnostics tests available for the current selected target.
      2. 'QCScli -t PHYPORTS -f bdf -i 01:00.00 "diag -c MII -c LED"' will 
         run MII and LED test for the selected target.
      3. 'QCScli -t PHYPORTS -f bdf -i 01:00.00 "diag -c all -l 5 -v 8"' 
         will run all the tests for 5 times with LED test interval 8 
         milliseconds for the selected target.

      - In Interactive mode, use 'list <view>' and 'select <idx>' commands 
        to select the desired target device.  
        Use 'diag {[-c REG ] [-c MII ] [-c EEP] [-c MEM] [-c CPU] 
        [-c INT] [-c MACLB ] [-c PHYLB] [-c LED] | [-c ALL]} 
        [-l <cnt> ] [ -v <LEDIntv> ]' command to run diagnostics 
        tests for the selected target.

      Examples:
      1. 'diag' will display all the diagnostics tests available for 
         the current selected target.
      2. 'diag -c MII -c LED' will run MII and LED test for the 
         selected target.
      3. 'diag -c all -l 5 -v 8' will run all the tests for 5 times 
         with LED test interval 8 milliseconds for the selected target.

    8.18 How to run cable diagnostic test of a selected target?
    - In CLI mode, use 'QCScli -t <target type> -f <target format> 
      -i <target ID> cablediag' to run cable diagnostics test for 
      selected target. This command is available for PHYPORTS device only.

      Examples:
      1. 'QCScli -t PHYPORTS -f bdf -i 01:00.00 "cablediag"' will run 
         the cable diagnostics test for the current selected target.
      
    - In Interactive mode, use 'list <view>' and 'select <idx>' commands 
      to select the desired target device.  Use 'cablediag' to run cable 
      diagnostics test for selected target.

      Examples:
      1. 'cablediag' will run the cable diagnostics test for the current 
          selected target.

    8.19 How to run network diagnostic test of a selected target?
    - In CLI mode, use 'QCScli -t <target type> -f <target format> 
      -i <target ID> networkdiag [-p <IP address>]' to run cable diagnostics 
      test for selected target. This command is available for NDIS and 
      virtual adapters.

      Examples:
      1. 'QCScli -t NDIS -f mac -i 0010181a1b1c "networkdiag -p 192.168.1.5"' 
         will run the network test for the current selected NDIS adapter.
      2. 'QCScli -t VNIC -f name -i "vlan 1" "networkdiag"' will run the 
         network test for the current selected virtual adapter. Since there is 
         no ip address specified, QCScli will use gateway address for 
         the test. "vlan 1" is the name of the VNIC. When there is a VLAN present,
         the name of the VNIC is the name of the VLAN. When there is no VLAN
         present, the name of the VNIC is the name of the team.

    - In Interactive mode, use 'list <view>' and 'select <idx>' commands to 
      select the desired target device.  Use 'networkdiag [-p <IP address>]' 
      to run cable diagnostics test for selected target.

      Examples:
      1. 'networkdiag -p 192.168.1.5' will run the network test for the current 
         selected NDIS adapter.
      2. 'networkdiag' will run the network test for the current selected 
         virtual adapter.


    8.20 How to refresh a host to get latest host status and stats?
    - In CLI mode, use 'QCScli -t hosts "refresh"
      
    - In the interactive mode, use 'refresh' command under a host node

    8.21 Examples of other commands?
      1. 'help' will display a list of available commands.
      
      2. 'version' will display the version of QCScli.
      
      3. 'log <file> will turn on the log and log all the information to <file>.
      
      4. 'log' will turn off the log.
      
      5. 'showsel' will show the current selected target.


10. Configuration File Usage:
============================
Usage:

9.1 Team Configuration File:

 9.1.1 Syntax:

    The syntax plain text file is defined as following. The team parameters 
    can be specified either using 'NO_LIVELINK_PARAMS' or using 
    'LIVELINK_PARAMS'. 

    TEAM_CFG
    [TEAM_CFG]
    ...

    1. Each 'TEAM_CFG' with NO_LIVELINK_PARAMS is defined as follows:

    name: team_name
    [type: team_type]
    pnic: MAC_address
    [pnic: MAC_address
    ...]
    [snic: MAC_address]
    [[ip: IP_address
    smask: subnetmask]
    |[vname: VLAN_name
    vid: VLAN_ID
    [ip: IP_address
    smask: subnetmask]]
    ...]

    2. Each 'TEAM_CFG' with LIVELINK_PARAMS is defined as follows:

    name: livelinkteam_name
    [type: livelink_team_type]
    target_ip: ip1 
    [target_ip: ip2 
    target_ip: ip3
    target_ip: ip4]
    [retry: 3]
    [freq: 2000]
    [retry_freq: 2000]
    [livelink_vid: 1234]
    [pnic: MAC_address|PCIINFO 
    livelink_ip: ll_ip
    livelink_ipv6: ll_ipv6
    pnic: MAC_address|PCIINFO 
    livelink_ip: ll_ip
    pnic:...]
    [snic: MAC_address|PCIINFO 
    livelink_ip: ll_ip]
    [[ip: IP_address
    smask: subnetmask]
    |[vname: VLAN_name
    vid: VLAN_ID
    [ip: IP_address
    smask: subnetmask]]
    ...]

    A configuration file MUST contain at least one team configuration. 
    'QCScli.exe' will recognize 'name' as starting point of a team 
    configuration section. All lines after 'name' will apply to the 
    'team_name' until another 'name' or end of file is encountered.
    Each team configuration MUST contain at least one physical network 
    adapter or the configuration of the team will be ignored.
    If 'type' is missing, the default is set to Smart Load Balancing (SLB).
    There are four team types, SLB = 0, GEC = 1, LACP = 2 and SLB-AFD = 4.
    If 'ip' is set, 'smask' must also be set or 'ip' will be ignored. 
    If 'ip' is not set, DHCP will be used.
    Team IP can be set if no VLAN are configured. If any VLAN is
    configured, the team IP will be ignored. Multiple VLAN 
    configurations are allowed. Each VLAN configuration allows an
    optional static IP information. Each IP MUST be couple with 
    'smask' or will be ignored.
    Please note that there must at least one white space or tab
    between the tag ('name', 'pnic', etc.) and the value pair 
    ('team_name', 'MAC_address', etc.) in each line.
    For the keywords before semicolons, they are case sensitive.

 9.1.2 Example:

    1. A sample of the TeamConfig.txt configuration file 
    with NO_LIVELINK_PARAMS:

    name: QLOGICTeam
    type: 1
    pnic: 00101801794D
    pnic: 00:0B.2
    vname: VLAN2
    vid: 2
    vname: VLAN3
    vid: 3
    ip: 172.16.8.3
    smask: 255.255.255.0
    vname: VLAN4
    vid: 4
    ip: 172.16.8.4
    smask: 255.255.255.0
    vname: VLAN5
    vid: 5
    ip: 172.16.8.5
    smask: 255.255.255.0
    
    2. A sample of the TeamConfig.txt configuration file 
    with LIVELINK_PARAMS:

    name: LiveLinkTeam
    type: 0
    target_ip: 172.16.8.66 
    target_ip: 172.16.8.77
    target_ip: 172.16.8.88 
    target_ip: fc01::101
    livelink_vid: 1234
    pnic: 00101801794D 
    livelink_ip: 172.16.8.10
    livelink_ipv6: fc01::218
    pnic: 01:0D.0 
    livelink_ip: 172.16.8.11
    snic: 02:03.00   
    livelink_ip: 172.16.8.20
    vname: VLAN2
    vid: 2
    vname: VLAN3
    vid: 3
    ip: 172.16.8.3
    smask: 255.255.255.0
    vname: VLAN4
    vid: 4
    ip: 172.16.8.4
    smask: 255.255.255.0
    vname: VLAN5
    vid: 5
    ip: 172.16.8.5
    smask: 255.255.255.0

9.2 Boot configuration XML file:

  9.2.1 iSCSI Example:

    <?xml version="1.0" encoding="UTF-8"?>
     
    <iSCSIBootConfiguration>
        <QCScli><Version>v14.8.0</Version></QCScli>
        <iSCSIGeneral>
            <TCPIPviaDHCP>Disabled</TCPIPviaDHCP>
            <iSCSIPviaDHCP>Disabled</iSCSIPviaDHCP>
            <CHAPAuthentication>Enabled</CHAPAuthentication>
            <BoottoiSCSITarget>Disabled</BoottoiSCSITarget>
        </iSCSIGeneral>
        <IscsiInitiator>
            <IPAddress>10.13.241.147</IPAddress>
            <SubnetMask>255.255.254.0</SubnetMask>
            <DefaultGateWay>10.13.241.1</DefaultGateWay>
            <PrimaryDNS>10.10.10.10</PrimaryDNS>
            <SecondaryDNS>20.20.20.20</SecondaryDNS>
            <iSCSIName>iqn</iSCSIName>
            <CHAPID>user</CHAPID>
            <CHAPSecret>password</CHAPSecret>
        </IscsiInitiator>
        <IscsiTarget>
            <Connect>Enabled</Connect>
            <IPAddress>10.13.241.147</IPAddress>
            <TCPPort>26535</TCPPort>
            <BootLun>255</BootLun>
            <iSCSIName>iname</iSCSIName>
            <CHAPID>admin1</CHAPID>
            <CHAPSecret>password1</CHAPSecret>
        </IscsiTarget>
        <IscsiSecTarget>
            <Connect>Enabled</Connect>
            <IPAddress>192.168.145.112</IPAddress>
            <TCPPort>34589</TCPPort>
            <BootLun>2</BootLun>
            <iSCSIName>name</iSCSIName>
            <CHAPID>user</CHAPID>
            <CHAPSecret>passwd</CHAPSecret>
        </IscsiSecTarget>
        <IscsiMPIO>
            <EnableMPIO>Enabled</EnableMPIO>
            <SecondaryDevice>Adapter2 (57712A1) / Port2</SecondaryDevice>
            <UseIndependentTargetPortal>Enabled</UseIndependentTargetPortal>
            <UseIndependentTargetName>Enabled</UseIndependentTargetName>
        </IscsiMPIO>
    </iSCSIBootConfiguration>

9.3 nic partition XML file:

  9.3.1 nic partition config Example:

  <?xml version="1.0" encoding="UTF-8" ?> 
    <NicPartitionConfiguration>
      <Version>2</Version> 
      <NicPartition>Enabled</NicPartition> 
      <PortConfig>
        <Port>0</Port> 
        <FlowControl>Auto</FlowControl> 
        <FunctionConfig>
          <Function>0</Function> 
          <EthernetNdis>Enable</EthernetNdis> 
          <iSCSI>Enable</iSCSI> 
          <FCoE>Disable</FCoE> 
          <RelativeBandwidth>1</RelativeBandwidth> 
          <MaxBandwidth>0</MaxBandwidth> 
        </FunctionConfig>
        <FunctionConfig>
          <Function>2</Function> 
          <EthernetNdis>Enable</EthernetNdis> 
          <iSCSI>Disable</iSCSI> 
          <FCoE>Disable</FCoE> 
          <RelativeBandwidth>1</RelativeBandwidth> 
          <MaxBandwidth>0</MaxBandwidth> 
        </FunctionConfig>
        <FunctionConfig>
          <Function>4</Function> 
          <EthernetNdis>Enable</EthernetNdis> 
          <iSCSI>Disable</iSCSI> 
          <FCoE>Disable</FCoE> 
          <RelativeBandwidth>1</RelativeBandwidth> 
          <MaxBandwidth>0</MaxBandwidth> 
        </FunctionConfig>
        <FunctionConfig>
          <Function>6</Function> 
          <EthernetNdis>Enable</EthernetNdis> 
          <iSCSI>Disable</iSCSI> 
          <FCoE>Disable</FCoE> 
          <RelativeBandwidth>97</RelativeBandwidth> 
          <MaxBandwidth>0</MaxBandwidth> 
        </FunctionConfig>
      </PortConfig>
      <PortConfig>
        <Port>1</Port> 
        <FlowControl>Auto</FlowControl> 
        <FunctionConfig>
          <Function>1</Function> 
          <EthernetNdis>Enable</EthernetNdis> 
          <iSCSI>Disable</iSCSI> 
          <FCoE>Disable</FCoE> 
          <RelativeBandwidth>10</RelativeBandwidth> 
          <MaxBandwidth>0</MaxBandwidth> 
        </FunctionConfig>
        <FunctionConfig>
          <Function>3</Function> 
          <EthernetNdis>Enable</EthernetNdis> 
          <iSCSI>Enable</iSCSI> 
          <FCoE>Disable</FCoE> 
          <RelativeBandwidth>20</RelativeBandwidth> 
          <MaxBandwidth>0</MaxBandwidth> 
        </FunctionConfig>
        <FunctionConfig>
          <Function>5</Function> 
          <EthernetNdis>Enable</EthernetNdis> 
          <iSCSI>Disable</iSCSI> 
          <FCoE>Disable</FCoE> 
          <RelativeBandwidth>30</RelativeBandwidth> 
          <MaxBandwidth>0</MaxBandwidth> 
        </FunctionConfig>
        <FunctionConfig>
          <Function>7</Function> 
          <EthernetNdis>Enable</EthernetNdis> 
          <iSCSI>Disable</iSCSI> 
          <FCoE>Disable</FCoE> 
          <RelativeBandwidth>40</RelativeBandwidth> 
          <MaxBandwidth>0</MaxBandwidth> 
        </FunctionConfig>
      </PortConfig>
    </NicPartitionConfiguration>

  9.3.2 Disable nic partition through XML config file Example:

  <?xml version="1.0" encoding="UTF-8" ?> 
    <NicPartitionConfiguration>
      <Version>2</Version> 
      <NicPartition>Disbled</NicPartition> 
    </NicPartitionConfiguration>

9.4 Account and Role management XML file:

  9.4.1 account config Example:

   <?xml version="1.0" encoding="UTF-8" ?> 
    <AccountConfiguration>
      <Account>
        <Key READONLY=true>User:1</Key> 
        <Name>Administrator</Name> 
        <Password>trumanage</Password> 
        <AccountEnabled>true</AccountEnabled> 
        <Roles>
          <Role>Administrator Role</Role> 
           ...
        </Roles>
        ...
      </Account>
      <Account>
        <Key READONLY=true>User:2</Key> 
        <Name>Operator</Name> 
        <Password>trumanage</Password> 
        <AccountEnabled>true</AccountEnabled> 
        <Roles>
          <Role>Operator Role</Role> 
           ...
        </Roles>
        ...
      </Account>
      <Account>
        <!-- new account does not have Key --> 
        <Name>Jane</Name> 
        <Password>trumanage</Password> 
        <AccountEnabled>true</AccountEnabled> 
        <Roles>
          <Role>Read Only Role</Role> 
           ...
        </Roles>
        ...
      </Account>
      ...    
      <AvailableRoles READONLY=true>
          <Role>Administrator Role</Role> 
          <Role>Operator Role</Role> 
          <Role>Read Only Role</Role> 
           ...
      </AvailableRoles> 
    </AccountConfiguration>

  9.4.2 Role config Example:

   <?xml version="1.0" encoding="UTF-8" ?> 
    <RoleConfiguration>
      <Role>
        <Key READONLY=true>Role:1</Key> 
        <Name>Administrator Role</Name> 
        <Privileges>
          <Privilege>Base Desktop and mobile Read privilege</Privilege> 
           ...
        </Privileges>
        ...
      </Role>
      <Role>
        <Key READONLY=true>Role:2</Key> 
        <Name>Operator Role</Name> 
        <Privileges>
          <Privilege>Base Desktop and mobile Read privilege</Privilege> 
           ...
        </Privileges>
        ...
      </Role>
      ...   
      <AvailablePrivilieges READONLY=true>
          <Privilege>Base Desktop and mobile Read privilege</Privilege> 
          <Privilege>Base Desktop and mobile write privilege</Privilege> 
           ...
      </AvailablePrivilieges> 
    </RoleConfiguration>


11. Exit Codes:
===============
QCSCLI_OK                                  0       // Upgrade firmware OK
QCSCLI_QUIT                                1       // Quit program
QCSCLI_PARAM_ERROR                         2       // Not correct parameters
QCSCLI_ADAPTER_NOT_FOUND                   3       // Adapter not found
QCSCLI_CANNOT_LOCK_ADAPTER                 4       // Cannot lock adapter
QCSCLI_GET_CLOSE_EVENT                     5       // Get close event
QCSCLI_INIT_FAILED                         6       // Initialization failed
QCSCLI_UNSUPPORTED_QLDMAPI_VER             7       // QLDMAPI is too old
QCSCLI_UNKNOWN_COMMAND                     8       // Unknown command
QCSCLI_MALLOC_ERROR                        9       // memory allocation error
QCSCLI_QLDMAPI_ERROR                       10      // QLDMAPI call returns error
QCSCLI_OS_NOT_SUPPORTED                    11      // OS is not supported
QCSCLI_NO_ADVANCED_PARAMS                  12      // No Advanced Parameter for the NIC
QCSCLI_INVALID_ADVANCED_PARAM_DETECTED     13      // Invalid Advanced Parameter detected
QCSCLI_INVALID_ADVANCED_PARAM_SPECIFIED    14      // Invalid Advanced Parameter specified
QCSCLI_INVALID_ADVANCED_VALUE_SPECIFIED    15      // Invalid Advanced Value specified
QCSCLI_FEATURE_NOT_SUPPORTED_FOR_NIC       16      // Feature not supported for the NIC
QCSCLI_SET_ADVANCED_PARAM_ERROR            17      // Failed to set the Advanced Parameter with new value
QCSCLI_SYSTEM_REBOOT                       18      // System Reboot required
QCSCLI_UNSUPPORT_PLATFORM                  19      // System platform is not supported
QCSCLI_NOT_ENOUGH_PRIVILEGE                20      // Current user does not have enough privilege
QCSCLI_READ_LICENSE_FILE_ERROR             21      // Error in reading license file
QCSCLI_INVALID_LICENSE_KEY                 22      // Invalid license key
QCSCLI_INVALID_ISCSI_PARAM_SPECIFIED       23      // Invalid iSCSI Management Parameter specified
QCSCLI_INVALID_ISCSI_VALUE_SPECIFIED       24      // Invalid iSCSI Management Value specified
QCSCLI_INVALID_RSC_PARAM_SPECIFIED         25      // Invalid Resource Parameter specified
QCSCLI_INVALID_RSC_VALUE_SPECIFIED         26      // Invalid Resource Value specified
QCSCLI_FEATURE_NOT_SUPPORTED_IN_FCFS       27      // Feature not supported in FCFS mode
QCSCLI_PARAM_IS_READ_ONLY                  28      // This parameter can't be modified, Administrator authority required.
QCSCLI_NULL_IP_ADDRESS                     29      // The current IP address is NULL.
QCSCLI_CANNOT_UNLOCK_ADAPTER               30      // Failed to unlock adapter.
QCSCLI_INVALID_VALUE_SPECIFIED             31      // Invalid value specified
QCSCLI_NIC_IS_PART_OF_GEC_LACP_TEAM        32      // NIC is part of a GEC/LACP Team.
QCSCLI_REGISTRY_ACCESS_ERROR               33      // Error in accessing Registry.
QCSCLI_NOT_AN_ISCSI_BOOT_DEVICE            34      // This is not an iSCSI Boot device.
QCSCLI_INVALID_IP_ADDRESS                  35      // Invalid IP Address.
QCSCLI_DUPLICATE_IP_ADDRESS                36      // Duplicate IP Address.
QCSCLI_TEAM_DRIVER_NOT_LOAD                37      // NIC driver has to be loaded to make it a member of a team.
QCSCLI_NDIS6_DRIVER_REQUIRED               38      // Ndis6 driver is required for the NIC to join the Team in Windows Vista and later.
QCSCLI_TEAM_UNKNOWN_NIC                    39      // Unknown NIC.
QCSCLI_INVALID_SUBNET_MASK                 40      // Invalid subnet mask.
QCSCLI_INVALID_CMD                         41      // Invalid command.
QCSCLI_INVALID_FCOE_PARAM_SPECIFIED	    42      // Invalid FCoE Management Parameter specified
QCSCLI_INVALID_FCOE_VALUE_SPECIFIED	    43      // Invalid FCoE Management Value specified
QCSCLI_DEFAULT_FAILED                      44      // Failed to set the NDIS Advanced settings as default values
QCSCLI_DATA_OBJECT_IS_NULL                 45      // Failed to get the DataObject
QCSCLI_CLIID_IS_NULL                       46      // CLIID is NULL
QCSCLI_EXCEED_MAX_PWD_LENGTH               47      // Exceed the maximum length of password. 
QCSCLI_GET_BREAK_EVENT                     48      // Get break event
QCSCLI_INVALID_IFACE_FILE_NAME             49      // Invalid IFace File Name specified.
QCSCLI_DUPLICATED_IFACE_FILE_NAME          50      // Duplicated IFace File Name specified.
QCSCLI_INCOMPATIBLE_ISCSI_PARAM_SPECIFIED  51      // Incompatible iSCSI Management Parameter specified
QCSCLI_ISCSI_PARAM_MISSING                 52      // iSCSI Management Parameter is missing

QCSCLI_NOT_YET_IMPL                        1000    // This functionality is not yet implemented.
QCSCLI_UNWIND                              1001    // Unwind to the parent processor
QCSCLI_NOT_APPLICABLE                      1002    // Command not applicable
QCSCLI_NO_TARGET_SEL                       1003    // No active target selection.
QCSCLI_INVALID_CONTEXT                     1004    // Not a valid context
QCSCLI_INVALID_FORMAT                      1005    // Invalid format selection
QCSCLI_INVALID_TARGET_ID                   1006    // Invalid target identifier
QCSCLI_FILE_DOES_NOT_EXIST                 1007    // File does not exist
QCSCLI_INVALID_TEAM_NAME                   1008    // Supplied team name is invalid
QCSCLI_TEAM_COMMIT_FAILED                  1009    // Failed to commit the team operation.
QCSCLI_TEAM_REMOVE_FAILED                  1010    // Failed to remove the team.
QCSCLI_CANNOT_OPEN_FILE                    1011    // Failed to open the file handle.
QCSCLI_ERR_CANNOT_SET_IPADDR               1012    // Failed to set ip address.
QCSCLI_ERR_CANNOT_GET_NIC_PCI_INFO         1013    // Failure retrieving NIC information
QCSCLI_ERR_RETRIEVE_IP_ADDR                1014    // Error retrieving IP address information
QCSCLI_FAILED_GET_INFO                     1015    // Failed to get info from the DataContainer
QCSCLI_WRONG_OPTION_FLAG                   1016    // General team config file parsing error.
QCSCLI_EXCEEDMAXVLAN                       1017    // Only a maximum of 64 VLANs are allowed.
QCSCLI_CANNOT_CREATE_LIVE_LINK             1018    // Live link support only applied to SLB team
QCSCLI_EXCEED_MAX_TARGET_IP                1019    // Live link support allows up to 4 link
QCSCLI_TOO_MANY_PHY_NIC                    1020    // Only up to a maximum of 8 nics are allowed in a team.
QCSCLI_CANNOT_CREATE_FECGEC_8023AD         1021    // Cannot create FECGEC or 802.3ad team with standby adapter.
QCSCLI_LL_IP_TARGET_IP_TYPE_MISMATCH       1022    // Invalid IPv6 Address
QCSCLI_INVALID_RANGE                       1023    // Value is out of range.
QCSCLI_INVALID_INTERVAL                    1024    // Invalid probe retry frequency
QCSCLI_DUPLICATE_OPTION                    1025    // The same option has been specified previously
QCSCLI_DUPLICATE_MAC_ADDRESS               1026    // Duplicate adapter physical MAC address
QCSCLI_DUPLICATE_VLANID                    1027    // Duplicate VLAN name
QCSCLI_TEAM_ALREADY_EXISTS                 1028    // Team with the specified name already exists
QCSCLI_CANNOT_MATCH_MAC_ADDR               1030    // Cannot find device using the specified MAC address.
QCSCLI_NO_TEAM_TO_CONFIG                   1031    // No team to configure.
QCSCLI_CANNOT_CREATE_TEAM                  1032    // Failure while creating team
QCSCLI_NO_LINK_FOR_IP_CFG                  1033    // No link is present in team to set ip address.
QCSCLI_ONE_OR_MORE_CREATE_FAILED           1034    // Creation of one or more teams failed.
QCSCLI_TEAM_NO_MEMBER                      1035    // A team is required to have at least one valid member
QCSCLI_NO_BRCM_NIC_IN_TEAM                 1036    // Team requires at least one QLogic nic.
QCSCLI_ONLY_BROADCOM_NIC_FOR_VLAN          1037    // Only QLogic certified adapters are supported in VLAN.
QCSCLI_CANNOT_SET_IPADDR                   1038    // Failed to assign ip address on the virtual adapter.
QCSCLI_INVALID_CFG                         1039    // Invalid configuration
QCSCLI_SET_ADVANCE_PARAM_FAILED            1040    // Failed to set advanced parameter
QCSCLI_INTERNAL_ERROR_INVALID_DATA         1041    // Invalid or NULL data found
QCSCLI_INVALID_PARAMETER                   1042    // Invalid Parameter. Parameter is too few
QCSCLI_NIC_NOT_SUPPORTED                   1043    // The current NIC is not supported for this operation
QCSCLI_SET_ASF_FAILED                      1044    // Failed to set the ASF Table
QCSCLI_SET_POWER_MGMT_FAILED               1045    // Failed to set Power Management configuration
QCSCLI_INVALID_TARGET_CMD                  1046    // command/target identifier is invalid
QCSCLI_NO_ISCSI_SESSIONS                   1047    // No iSCSI sessions exists on the system
QCSCLI_SET_MGMT_OBJ_FAILED                 1048    // Failed to set Management Object
QCSCLI_SHOW_USAGE                          1049    // If we want to show usage
QCSCLI_EXCEEDMAXTAGGEDVLAN                 1051    // Only a maximum of 63 tagged VLANs are allowed.
QCSCLI_NO_TEAM_AVALIABLE                   1052    // There is no team to save.
QCSCLI_NOT_CONFIGURABLE                    1053    // Not Configurable.
QCSCLI_CANNOT_SUSPEND_RESUME_DRIVER        1054    // Failed to suspend or resume the driver.
QCSCLI_CANNOT_RESTART_DRIVER	            1055    // Failed to restart the driver.
QCSCLI_GET_CONFIG_FAILED                   1056    // Failed to get configuration.
QCSCLI_SET_CONFIG_FAILED                   1057    // Failed to save configuration.
QCSCLI_ACTION_FAILED                       1058    // Current Action Failed.
QCSCLI_FILE_TOO_BIG                        1059    // File is too big
QCSCLI_FILE_READ_ERR                       1060    // Error read file
QCSCLI_PORT_DIAG_FAILED                    1061    // any port diag test failed
QCSCLI_PORT_DIAG_UNSUPPORTED_TEST          1062    // unsupported port diag test
QCSCLI_PORT_DIAG_BREAK	                    1063    // user break port diag test
QCSCLI_PORT_DIAG_TIMEOUT                   1064    // port diag test timeout
QCSCLI_NPAR_OUT_OF_SYNC                    1065    // npar out of sync, need to reboot.
QCSCLI_ISCSI_CFG_NEED_SESSION_LOGOUT       1066    // Cannot change iSCSI config with session
QCSCLI_ISCSI_CFG_NEED_RELOGIN_SESSION      1067    // iSCSI config needs session to relogin to take effect
QCSCLI_CLI_MODE_EXIT                       1068    // CLI mode exit
QCSCLI_DATA_NOT_SUPPORTED                  1069    // Feature is not supported
QCSCLI_DATA_INVALID                        1070    // Data is invalid
QCSCLI_ACTION_FAILED_BECAUSE_ACCESS_DENIED 1071    // Action failed because of access denied.
QCSCLI_TRUMAGE_SET_PAGE_ERR                1072    // Trumanagement config set failed     
QCSCLI_TRUMAGE_GET_PAGE_ERR                1073    // Trumanagement config get failed    
QCSCLI_CLI_MODE_HOST_SPECIFIED             1074    // Host is not specified to connect

12. Third Party Software License
================================

Portions of this software contain third party code subject to the following conditions:

License of libxml2

/* Except where otherwise noted in the source code (e.g. the files hash.c,
 * list.c and the trio files, which are covered by a similar licence but
 * with different Copyright notices) all the files are:
 * 
 *  Copyright (C) 1998-2003 Daniel Veillard.  All Rights Reserved.
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is fur-
 * nished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FIT-
 * NESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
 * DANIEL VEILLARD BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CON-
 * NECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 * 
 * Except as contained in this notice, the name of Daniel Veillard shall not
 * be used in advertising or otherwise to promote the sale, use or other deal-
 * ings in this Software without prior written authorization from him.
 */


License of libedit

/*-
 * Copyright (c) 1992, 1993
 *	The Regents of the University of California.  All rights reserved.
 *
 * This code is derived from software contributed to Berkeley by
 * Christos Zoulas of Cornell University.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the University nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE REGENTS AND CONTRIBUTORS ``AS IS'' AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED.  IN NO EVENT SHALL THE REGENTS OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS
 * OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
 * LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
 * OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
 * SUCH DAMAGE.
 *
 */

License of libcurl

/****************************************************************************
 * COPYRIGHT AND PERMISSION NOTICE
 * 
 * Copyright (c) 1996 - 2010, Daniel Stenberg, <daniel@haxx.se>.
 * 
 * All rights reserved.
 *  
 * Permission to use, copy, modify, and distribute this software for any purpose
 * with or without fee is hereby granted, provided that the above copyright
 * notice and this permission notice appear in all copies.
 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF THIRD PARTY RIGHTS. IN
 * NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
 * OR OTHER DEALINGS IN THE SOFTWARE.
 
 * Except as contained in this notice, the name of a copyright holder shall not
 * be used in advertising or otherwise to promote the sale, use or other dealings
 * in this Software without prior written authorization of the copyright holder.
 * 
 *******************************************************************************/
License of Tcl/Tk

/*******************************************************************************/
/* This software is copyrighted by the Regents of the University of California,
 * Sun Microsystems, Inc., Scriptics Corporation, and other parties. The following
 * terms apply to all files associated with the software unless explicitly disclaimed
 * in individual files.
 *
 * The authors hereby grant permission to use, copy, modify, distribute, and license
 * this software and its documentation for any purpose, provided that existing copyright
 * notices are retained in all copies and that this notice is included verbatim in any
 * distributions. No written agreement, license, or royalty fee is required for any of
 * the authorized uses. Modifications to this software may be copyrighted by their authors
 * and need not follow the licensing terms described here, provided that the new terms
 * are clearly indicated on the first page of each file where they apply.
 *
 * IN NO EVENT SHALL THE AUTHORS OR DISTRIBUTORS BE LIABLE TO ANY PARTY FOR DIRECT,
 * INDIRECT, SPECIAL, INCIDENTAL, OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE USE OF
 * THIS SOFTWARE, ITS DOCUMENTATION, OR ANY DERIVATIVES THEREOF, EVEN IF THE AUTHORS
 * HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * THE AUTHORS AND DISTRIBUTORS SPECIFICALLY DISCLAIM ANY WARRANTIES, INCLUDING,
 * BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE, AND NON-INFRINGEMENT. THIS SOFTWARE IS PROVIDED ON AN "AS IS"
 * BASIS, AND THE AUTHORS AND DISTRIBUTORS HAVE NO OBLIGATION TO PROVIDE MAINTENANCE,
 * SUPPORT, UPDATES, ENHANCEMENTS, OR MODIFICATIONS.
 *
 * GOVERNMENT USE: If you are acquiring this software on behalf of the U.S. government,
 * the Government shall have only "Restricted Rights" in the software and related
 * documentation as defined in the Federal Acquisition Regulations (FARs) in Clause
 * 52.227.19 (c) (2). If you are acquiring the software on behalf of the Department of Defense,
 * the software shall be classified as "Commercial Computer Software" and the Government
 * shall have only "Restricted Rights" as defined in Clause 252.227-7013 (c) (1) of DFARs.
 * Notwithstanding the foregoing, the authors grant the U.S. Government and others acting
 * in its behalf permission to use and distribute the software in accordance with the terms
 * specified in this license.
 */
 
*******************************************************************************/
License of OpenSSL
/* ****************************************************************************
 * Copyright (c) 1998-2019 The OpenSSL Project.  All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in
 *    the documentation and/or other materials provided with the
 *    distribution.
 *
 * 3. All advertising materials mentioning features or use of this
 *    software must display the following acknowledgment:
 *    "This product includes software developed by the OpenSSL Project
 *    for use in the OpenSSL Toolkit. (http://www.openssl.org/)"
 *
 * 4. The names "OpenSSL Toolkit" and "OpenSSL Project" must not be used to
 *    endorse or promote products derived from this software without
 *    prior written permission. For written permission, please contact
 *    openssl-core@openssl.org.
 *
 * 5. Products derived from this software may not be called "OpenSSL"
 *    nor may "OpenSSL" appear in their names without prior written
 *    permission of the OpenSSL Project.
 *
 * 6. Redistributions of any form whatsoever must retain the following
 *    acknowledgment:
 *    "This product includes software developed by the OpenSSL Project
 *    for use in the OpenSSL Toolkit (http://www.openssl.org/)"
 *
 * THIS SOFTWARE IS PROVIDED BY THE OpenSSL PROJECT ``AS IS'' AND ANY
 * EXPRESSED OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE OpenSSL PROJECT OR
 * ITS CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
 * NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
 * STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
 * OF THE POSSIBILITY OF SUCH DAMAGE.
 * ====================================================================
 *
 * This product includes cryptographic software written by Eric Young
 * (eay@cryptsoft.com).  This product includes software written by Tim
 * Hudson (tjh@cryptsoft.com).
 *
 */

 Original SSLeay License
 -----------------------

/* Copyright (C) 1995-1998 Eric Young (eay@cryptsoft.com)
 * All rights reserved.
 *
 * This package is an SSL implementation written
 * by Eric Young (eay@cryptsoft.com).
 * The implementation was written so as to conform with Netscapes SSL.
 *
 * This library is free for commercial and non-commercial use as long as
 * the following conditions are aheared to.  The following conditions
 * apply to all code found in this distribution, be it the RC4, RSA,
 * lhash, DES, etc., code; not just the SSL code.  The SSL documentation
 * included with this distribution is covered by the same copyright terms
 * except that the holder is Tim Hudson (tjh@cryptsoft.com).
 *
 * Copyright remains Eric Young's, and as such any Copyright notices in
 * the code are not to be removed.
 * If this package is used in a product, Eric Young should be given attribution
 * as the author of the parts of the library used.
 * This can be in the form of a textual message at program startup or
 * in documentation (online or textual) provided with the package.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. All advertising materials mentioning features or use of this software
 *    must display the following acknowledgement:
 *    "This product includes cryptographic software written by
 *     Eric Young (eay@cryptsoft.com)"
 *    The word 'cryptographic' can be left out if the rouines from the library
 *    being used are not cryptographic related :-).
 * 4. If you include any Windows specific code (or a derivative thereof) from
 *    the apps directory (application code) you must include an acknowledgement:
 *    "This product includes software written by Tim Hudson (tjh@cryptsoft.com)"
 *
 * THIS SOFTWARE IS PROVIDED BY ERIC YOUNG ``AS IS'' AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED.  IN NO EVENT SHALL THE AUTHOR OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS
 * OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
 * LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
 * OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
 * SUCH DAMAGE.
 *
 * The licence and distribution terms for any publically available version or
 * derivative of this code cannot be changed.  i.e. this code cannot simply be
 * copied and put under another distribution licence
 * [including the GNU Public Licence.]
 */
/*******************************************************************************/
